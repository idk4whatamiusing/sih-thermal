// osmsync ingests industrial-site polygons from the OSM Overpass API into
// Postgres via the db gRPC service (UpsertIndustrialSite). Run manually or on
// a cron for a given pilot bbox - this is not called by any live request path.
//
// Usage:
//
//	osmsync -min-lat 22.0 -min-lon 69.5 -max-lat 23.0 -max-lon 70.5
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	dbpb "github.com/idk4whatamiusing/meridian_stack/api/pb/dbpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

const overpassURL = "https://overpass-api.de/api/interpreter"

// overpassQuery finds nodes/ways/relations tagged as industrial sites within
// the bbox, using "out center" so ways/relations resolve to a single point.
func overpassQuery(minLat, minLon, maxLat, maxLon float64) string {
	bbox := fmt.Sprintf("%f,%f,%f,%f", minLat, minLon, maxLat, maxLon)
	return fmt.Sprintf(`
[out:json][timeout:60];
(
  nwr["landuse"="industrial"](%s);
  nwr["man_made"="works"](%s);
  nwr["power"="plant"](%s);
);
out center tags;
`, bbox, bbox, bbox)
}

type overpassElement struct {
	Type   string                      `json:"type"`
	ID     int64                       `json:"id"`
	Lat    float64                     `json:"lat"`
	Lon    float64                     `json:"lon"`
	Center *struct{ Lat, Lon float64 } `json:"center"`
	Tags   map[string]string           `json:"tags"`
}

type overpassResponse struct {
	Elements []overpassElement `json:"elements"`
}

func fetchOverpass(minLat, minLon, maxLat, maxLon float64) (*overpassResponse, error) {
	q := overpassQuery(minLat, minLon, maxLat, maxLon)
	req, err := http.NewRequest(http.MethodPost, overpassURL, strings.NewReader(url.Values{"data": {q}}.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "orbis-osmsync/0.1 (PS162 SIH2026; contact via repo issues)")
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("overpass: HTTP %d", resp.StatusCode)
	}
	var out overpassResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

// industrialType maps OSM tags to the coarse categories db expects.
func industrialType(tags map[string]string) string {
	switch {
	case tags["power"] == "plant":
		if strings.Contains(strings.ToLower(tags["plant:source"]), "coal") || strings.Contains(strings.ToLower(tags["plant:source"]), "gas") {
			return "power_plant"
		}
		return "power_plant"
	case strings.Contains(strings.ToLower(tags["man_made"]), "works") && strings.Contains(strings.ToLower(tags["product"]), "steel"):
		return "steel"
	case tags["man_made"] == "works":
		return "refinery"
	case strings.Contains(strings.ToLower(tags["landuse"]), "industrial"):
		return "other"
	default:
		return "other"
	}
}

func main() {
	minLat := flag.Float64("min-lat", 22.0, "bbox min latitude")
	minLon := flag.Float64("min-lon", 69.5, "bbox min longitude")
	maxLat := flag.Float64("max-lat", 23.0, "bbox max latitude")
	maxLon := flag.Float64("max-lon", 70.5, "bbox max longitude")
	dbAddr := flag.String("db-addr", envOr("DB_GRPC_ADDR", "localhost:8010"), "db gRPC address")
	flag.Parse()

	secret := envOr("BACKEND_SECRET", "")
	if secret == "" {
		log.Fatal("BACKEND_SECRET must be set (never hardcode it - read from .env)")
	}

	log.Printf("querying Overpass for bbox [%f,%f,%f,%f]...", *minLat, *minLon, *maxLat, *maxLon)
	res, err := fetchOverpass(*minLat, *minLon, *maxLat, *maxLon)
	if err != nil {
		log.Fatalf("overpass query: %v", err)
	}
	log.Printf("overpass returned %d elements", len(res.Elements))

	conn, err := grpc.NewClient(*dbAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("dial db: %v", err)
	}
	client := dbpb.NewDbClient(conn)
	ctx := metadata.AppendToOutgoingContext(context.Background(), "x-backend-secret", secret)

	written := 0
	for _, el := range res.Elements {
		lat, lon := el.Lat, el.Lon
		if el.Center != nil {
			lat, lon = el.Center.Lat, el.Center.Lon
		}
		if lat == 0 && lon == 0 {
			continue // no usable geometry
		}
		tagsJSON, _ := json.Marshal(el.Tags)
		cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		_, err := client.UpsertIndustrialSite(cctx, &dbpb.UpsertIndustrialSiteRequest{
			OsmId: el.ID, CentroidLat: lat, CentroidLon: lon,
			IndustrialType: industrialType(el.Tags), Name: el.Tags["name"], TagsJson: string(tagsJSON),
		})
		cancel()
		if err != nil {
			log.Printf("upsert osm_id=%d: %v", el.ID, err)
			continue
		}
		written++
	}
	log.Printf("done: %d/%d industrial sites written", written, len(res.Elements))
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
