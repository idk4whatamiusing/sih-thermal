// Package rag - client for the Python sidecar's embedding + semantic-cache
// endpoints (localhost:8003). Storage/similarity search for the RAG store
// live in Postgres via db gRPC (see ai/cmd/ai's retrieveDocs/ingestDocs) -
// this sidecar only computes vectors, it never talks to Postgres directly.
package rag

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Source struct {
	Id    string  `json:"id"`
	Title *string `json:"title"`
	Text  string  `json:"text"`
	Score float32 `json:"score"`
}

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
		return fmt.Errorf("rag %s: %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// Embed returns a 768-dim bge-base-en-v1.5 embedding for text.
func (c *Client) Embed(text string) ([]float32, error) {
	var out struct {
		Embedding []float32 `json:"embedding"`
	}
	err := c.post("/embed", map[string]any{"text": text}, &out)
	return out.Embedding, err
}

type Lookup struct {
	Hit         bool    `json:"hit"`
	Answer      string  `json:"answer"`
	SourcesHash string  `json:"sources_hash"`
	Score       float64 `json:"score"`
}

func (c *Client) CacheLookup(kind, userID, text string, threshold float64) Lookup {
	var out Lookup
	_ = c.post("/cache_lookup", map[string]any{
		"kind": kind, "user_id": userID, "text": text, "threshold": threshold,
	}, &out)
	return out
}

func (c *Client) CacheStore(kind, userID, text, answer, sourcesHash string) {
	_ = c.post("/cache_store", map[string]any{
		"kind": kind, "user_id": userID, "text": text,
		"answer": answer, "sources_hash": sourcesHash,
	}, &map[string]any{})
}
