// gdeltsync labels thermal_clusters with independent weak labels from GDELT
// news coverage (via the Python sidecar's /gdelt/label), written to
// label_events with source="gdelt". Not on any live request path - run
// manually or on a cron per pilot region, same shape as osmsync.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	dbpb "github.com/idk4whatamiusing/meridian_stack/api/pb/dbpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type gdeltLabelReply struct {
	Found               bool    `json:"found"`
	Label               string  `json:"label"`
	Confidence          float64 `json:"confidence"`
	MatchedArticleURL   string  `json:"matched_article_url"`
	MatchedArticleTitle string  `json:"matched_article_title"`
}

func labelFromGdelt(base string, lat, lon float64, dateFrom, dateTo string) (*gdeltLabelReply, error) {
	body, _ := json.Marshal(map[string]any{"lat": lat, "lon": lon, "date_from": dateFrom, "date_to": dateTo})
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Post(base+"/gdelt/label", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gdelt label: HTTP %d", resp.StatusCode)
	}
	var out gdeltLabelReply
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	minLat := flag.Float64("min-lat", 22.0, "bbox min latitude")
	minLon := flag.Float64("min-lon", 69.5, "bbox min longitude")
	maxLat := flag.Float64("max-lat", 23.0, "bbox max latitude")
	maxLon := flag.Float64("max-lon", 70.5, "bbox max longitude")
	padDays := flag.Int("pad-days", 3, "date window padding around each cluster's last_seen, in days")
	dbAddr := flag.String("db-addr", envOr("DB_GRPC_ADDR", "localhost:8010"), "db gRPC address")
	sidecarURL := flag.String("sidecar-url", envOr("RAG_URL", "http://localhost:8003"), "python sidecar base URL")
	flag.Parse()

	secret := envOr("BACKEND_SECRET", "")
	if secret == "" {
		log.Fatal("BACKEND_SECRET must be set (never hardcode it - read from .env)")
	}

	conn, err := grpc.NewClient(*dbAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("dial db: %v", err)
	}
	client := dbpb.NewDbClient(conn)
	ctx := metadata.AppendToOutgoingContext(context.Background(), "x-backend-secret", secret)

	crep, err := client.ListThermalClusters(ctx, &dbpb.ListThermalClustersRequest{
		MinLat: *minLat, MinLon: *minLon, MaxLat: *maxLat, MaxLon: *maxLon,
	})
	if err != nil {
		log.Fatalf("list thermal clusters: %v", err)
	}
	log.Printf("found %d thermal clusters in bbox", len(crep.Clusters))

	labeled, skipped, noMatch := 0, 0, 0
	for _, c := range crep.Clusters {
		lrep, err := client.ListLabelEvents(ctx, &dbpb.ListLabelEventsRequest{ClusterId: c.Id, Limit: 100})
		if err != nil {
			log.Printf("cluster %s: list label events: %v", c.Id, err)
			continue
		}
		alreadyLabeled := false
		for _, e := range lrep.Events {
			if e.Source == "gdelt" {
				alreadyLabeled = true
				break
			}
		}
		if alreadyLabeled {
			skipped++
			continue
		}

		lastSeen, err := time.Parse("2006-01-02", c.LastSeen)
		if err != nil {
			log.Printf("cluster %s: bad last_seen %q: %v", c.Id, c.LastSeen, err)
			continue
		}
		dateFrom := lastSeen.AddDate(0, 0, -*padDays).Format("2006-01-02")
		dateTo := lastSeen.AddDate(0, 0, *padDays).Format("2006-01-02")

		gr, err := labelFromGdelt(*sidecarURL, c.CentroidLat, c.CentroidLon, dateFrom, dateTo)
		if err != nil {
			log.Printf("cluster %s: gdelt lookup: %v", c.Id, err)
			continue
		}
		if !gr.Found {
			noMatch++
			continue
		}
		if _, err := client.InsertLabelEvent(ctx, &dbpb.InsertLabelEventRequest{
			ClusterId: c.Id, Source: "gdelt", Label: gr.Label, Confidence: gr.Confidence,
			MatchedArticleUrl: gr.MatchedArticleURL, MatchedArticleTitle: gr.MatchedArticleTitle,
		}); err != nil {
			log.Printf("cluster %s: insert label event: %v", c.Id, err)
			continue
		}
		labeled++
	}
	log.Printf("done: %d labeled, %d already had a gdelt label, %d no match", labeled, skipped, noMatch)
}
