-- PS162 world 1yr+ (issue #20): read-path indexes for 10M+ row scale.
--
-- Deliberately NO table rewrite here: converting firms_points to declarative
-- RANGE partitioning needs a backfill window with exclusive lock, which we do
-- once during the RDS cutover (see infra/rds.tf), not on the live EC2 disk.
-- These indexes are CONCURRENTLY-safe under IF NOT EXISTS and apply online.
--
-- Hot retention target: 1yr+ world, all sensors (~22-40M rows/yr).
-- Cold: anything older than retention goes to R2 Parquet (see scripts/firms_backfill.py).

-- BRIN for acq_date range scans (tiny index, ideal for append-mostly time series)
CREATE INDEX IF NOT EXISTS firms_points_date_brin_idx ON firms_points USING BRIN (acq_date);

-- Composite for the dashboard's filtered reads (class + date window)
CREATE INDEX IF NOT EXISTS firms_points_class_date_idx ON firms_points (predicted_class, acq_date);

-- Cluster time-window lookups for the training join (build_dataset.py)
CREATE INDEX IF NOT EXISTS thermal_clusters_seen_idx ON thermal_clusters (first_seen, last_seen);
