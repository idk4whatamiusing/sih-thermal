// Package firms - client for the Python sidecar's /firms/* endpoints
// (same process as ai/internal/rag; the sidecar owns both RAG and FIRMS).
package firms

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	base string
	hc   *http.Client
}

func New(base string) *Client {
	return &Client{base: base, hc: &http.Client{Timeout: 60 * time.Second}}
}

func (c *Client) post(path string, in any, out any) error {
	body, _ := json.Marshal(in)
	resp, err := c.hc.Post(c.base+path, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("firms %s: %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

type PredictRequest struct {
	Lat              float64  `json:"lat"`
	Lon              float64  `json:"lon"`
	Frp              *float64 `json:"frp,omitempty"`
	BrightTi4        *float64 `json:"bright_ti4,omitempty"`
	BrightTi5        *float64 `json:"bright_ti5,omitempty"`
	Confidence       *string  `json:"confidence,omitempty"`
	Satellite        *string  `json:"satellite,omitempty"`
	DistIndustrialM  *float64 `json:"dist_industrial_m,omitempty"`
	InsideIndustrial *bool    `json:"inside_industrial,omitempty"`
	Persistence      *float64 `json:"persistence,omitempty"`
	Landcover        *int32   `json:"landcover,omitempty"`
}

type PredictReply struct {
	PredictedClass string   `json:"predicted_class"`
	IndustrialProb float64  `json:"industrial_prob"`
	Persistence    float64  `json:"persistence"`
	Reasons        []string `json:"reasons"`
}

func (c *Client) Predict(req PredictRequest) (PredictReply, error) {
	var out PredictReply
	err := c.post("/firms/predict", req, &out)
	return out, err
}

type ClusterPoint struct {
	Lat float64  `json:"lat"`
	Lon float64  `json:"lon"`
	Frp *float64 `json:"frp,omitempty"`
}

type ClusterRequest struct {
	Points     []ClusterPoint `json:"points"`
	EpsM       float64        `json:"eps_m"`
	MinSamples int            `json:"min_samples"`
	WindowDays int            `json:"window_days"`
}

type ClusterPointOut struct {
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	Cluster     int     `json:"cluster"`
	Persistence float64 `json:"persistence"`
}

type ClusterReply struct {
	Clusters  []ClusterPointOut `json:"clusters"`
	NClusters int               `json:"n_clusters"`
}

func (c *Client) Cluster(req ClusterRequest) (ClusterReply, error) {
	var out ClusterReply
	err := c.post("/firms/cluster", req, &out)
	return out, err
}

type IngestRequest struct {
	Bbox     [4]float64 `json:"bbox"`
	DateFrom string     `json:"date_from"`
	DateTo   string     `json:"date_to"`
}

type IngestReply struct {
	Ok    bool   `json:"ok"`
	Error string `json:"error"`
}

func (c *Client) Ingest(req IngestRequest) (IngestReply, error) {
	var out IngestReply
	err := c.post("/firms/ingest", req, &out)
	return out, err
}
