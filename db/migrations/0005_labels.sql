-- PS162: independent weak-label events for thermal_clusters, used to train
-- the classifier without relying on the heuristic labeling itself
-- (self-referential labels would just re-learn the heuristic).
--
-- source distinguishes independently-sourced labels (gdelt: matched news
-- coverage) from model-generated ones (ai_worker: Cloudflare Workers AI
-- arbitration, Phase 3) so training can weight the former higher and avoid
-- an echo-chamber feedback loop.
CREATE TABLE IF NOT EXISTS label_events (
    id UUID PRIMARY KEY,
    cluster_id UUID NOT NULL REFERENCES thermal_clusters(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('gdelt', 'ai_worker')),
    label TEXT NOT NULL,          -- same vocabulary as firms_points.predicted_class
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    matched_article_url TEXT NOT NULL DEFAULT '',
    matched_article_title TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_label_events_cluster ON label_events(cluster_id);
CREATE INDEX IF NOT EXISTS idx_label_events_source ON label_events(source);
