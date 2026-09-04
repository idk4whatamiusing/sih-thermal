-- PS162 GIS: PostGIS + firms thermal points + industrial infrastructure
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS firms_points (
    id UUID PRIMARY KEY,
    geom GEOMETRY(Point, 4326) NOT NULL,
    acq_date DATE NOT NULL,
    acq_time TIME,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    bright_ti4 DOUBLE PRECISION,
    bright_ti5 DOUBLE PRECISION,
    frp DOUBLE PRECISION,
    confidence TEXT,
    satellite TEXT,
    bright_t31 DOUBLE PRECISION,
    scan DOUBLE PRECISION,
    track DOUBLE PRECISION,
    landcover SMALLINT,
    dist_industrial_m DOUBLE PRECISION,
    inside_industrial BOOLEAN DEFAULT FALSE,
    osm_id BIGINT,
    persistence_score DOUBLE PRECISION DEFAULT 0,
    predicted_class TEXT, -- industrial_flare | thermal_power | mining | forest | agriculture | unknown
    industrial_prob DOUBLE PRECISION,
    cluster_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS firms_points_geom_idx ON firms_points USING GIST (geom);
CREATE INDEX IF NOT EXISTS firms_points_date_idx ON firms_points (acq_date);
CREATE INDEX IF NOT EXISTS firms_points_class_idx ON firms_points (predicted_class);
CREATE INDEX IF NOT EXISTS firms_points_cluster_idx ON firms_points (cluster_id);

CREATE TABLE IF NOT EXISTS thermal_clusters (
    id UUID PRIMARY KEY,
    centroid GEOMETRY(Point, 4326) NOT NULL,
    bbox GEOMETRY(Polygon, 4326),
    count INT NOT NULL DEFAULT 0,
    avg_frp DOUBLE PRECISION,
    max_frp DOUBLE PRECISION,
    persistence DOUBLE PRECISION DEFAULT 0, -- detections_days / window_days
    first_seen DATE,
    last_seen DATE,
    predicted_class TEXT,
    osm_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS thermal_clusters_centroid_idx ON thermal_clusters USING GIST (centroid);
CREATE INDEX IF NOT EXISTS thermal_clusters_class_idx ON thermal_clusters (predicted_class);

CREATE TABLE IF NOT EXISTS industrial_sites (
    osm_id BIGINT PRIMARY KEY,
    geom GEOMETRY(Polygon, 4326),
    centroid GEOMETRY(Point, 4326),
    tags JSONB,
    industrial_type TEXT, -- refinery | power_plant | steel | mining | lng | other
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS industrial_sites_geom_idx ON industrial_sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS industrial_sites_centroid_idx ON industrial_sites USING GIST (centroid);
