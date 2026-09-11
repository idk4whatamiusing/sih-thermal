use sqlx::{PgPool, Row};
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::pb::{
    db_server::Db,
    AppendChatMessageReply, AppendChatMessageRequest, ChatMessage, ChatSession,
    CreateChatSessionReply, CreateChatSessionRequest, DeleteChatSessionReply,
    DeleteChatSessionRequest, DocumentMatch, FirmsPoint, InsertLabelEventReply,
    InsertLabelEventRequest, LabelEvent, ListChatMessagesReply, ListChatMessagesRequest,
    ListChatSessionsReply, ListChatSessionsRequest, ListFirmsPointsReply, ListFirmsPointsRequest,
    ListLabelEventsReply, ListLabelEventsRequest, ListThermalClustersReply,
    ListThermalClustersRequest, ListUsersReply, ListUsersRequest, NearestIndustrialSiteReply,
    NearestIndustrialSiteRequest, QueryDocumentsReply, QueryDocumentsRequest,
    RenameChatSessionReply, RenameChatSessionRequest, ThermalCluster,
    UpdateFirmsPointClassificationReply, UpdateFirmsPointClassificationRequest,
    UpsertDocumentReply, UpsertDocumentRequest, UpsertFirmsPointReply, UpsertFirmsPointRequest,
    UpsertIndustrialSiteReply, UpsertIndustrialSiteRequest, UpsertThermalClusterReply,
    UpsertThermalClusterRequest, UpsertUserReply, UpsertUserRequest,
};

pub struct DbService {
    pool: PgPool,
    secret: String,
}

impl DbService {
    pub fn new(pool: PgPool, secret: String) -> Self {
        Self { pool, secret }
    }

    // every call must carry x-backend-secret - this service is private-network only
    fn authorize<T>(&self, req: &Request<T>) -> Result<(), Status> {
        let got = req
            .metadata()
            .get("x-backend-secret")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if constant_time_eq(got.as_bytes(), self.secret.as_bytes()) {
            Ok(())
        } else {
            Err(Status::unauthenticated("bad backend secret"))
        }
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[tonic::async_trait]
impl Db for DbService {
    async fn upsert_user(
        &self,
        req: Request<UpsertUserRequest>,
    ) -> Result<Response<UpsertUserReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let id = Uuid::parse_str(&r.id)
            .map_err(|_| Status::invalid_argument("id must be a uuid"))?;
        sqlx::query("INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING")
            .bind(id)
            .bind(&r.email)
            .execute(&self.pool)
            .await
            .map_err(db_err)?;
        Ok(Response::new(UpsertUserReply { ok: true }))
    }

    async fn list_users(
        &self,
        req: Request<ListUsersRequest>,
    ) -> Result<Response<ListUsersReply>, Status> {
        self.authorize(&req)?;
        let limit = req.into_inner().limit.clamp(0, 100) as i64;
        let rows: Vec<(Uuid, String)> =
            sqlx::query_as("SELECT id, email FROM users ORDER BY created_at DESC LIMIT $1")
                .bind(limit)
                .fetch_all(&self.pool)
                .await
                .map_err(db_err)?;
        Ok(Response::new(ListUsersReply {
            users: rows
                .into_iter()
                .map(|(id, email)| crate::pb::User {
                    id: id.to_string(),
                    email,
                })
                .collect(),
        }))
    }

    async fn create_chat_session(
        &self,
        req: Request<CreateChatSessionRequest>,
    ) -> Result<Response<CreateChatSessionReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let id = parse_uuid(&r.id)?;
        let user = parse_uuid(&r.user_id)?;
        let title = if r.title.is_empty() { "New chat".into() } else { r.title };
        sqlx::query("INSERT INTO chat_sessions (id, user_id, title) VALUES ($1, $2, $3)")
            .bind(id)
            .bind(user)
            .bind(title)
            .execute(&self.pool)
            .await
            .map_err(db_err)?;
        Ok(Response::new(CreateChatSessionReply { ok: true }))
    }

    async fn list_chat_sessions(
        &self,
        req: Request<ListChatSessionsRequest>,
    ) -> Result<Response<ListChatSessionsReply>, Status> {
        self.authorize(&req)?;
        let user = parse_uuid(&req.into_inner().user_id)?;
        let rows: Vec<(Uuid, String, bool, String)> = sqlx::query_as(
            "SELECT id, title, pinned, updated_at::text FROM chat_sessions \
             WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC",
        )
        .bind(user)
        .fetch_all(&self.pool)
        .await
        .map_err(db_err)?;
        Ok(Response::new(ListChatSessionsReply {
            sessions: rows
                .into_iter()
                .map(|(id, title, pinned, updated_at)| ChatSession {
                    id: id.to_string(),
                    title,
                    pinned,
                    updated_at,
                })
                .collect(),
        }))
    }

    async fn rename_chat_session(
        &self,
        req: Request<RenameChatSessionRequest>,
    ) -> Result<Response<RenameChatSessionReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        sqlx::query("UPDATE chat_sessions SET title = $3 WHERE id = $1 AND user_id = $2")
            .bind(parse_uuid(&r.id)?)
            .bind(parse_uuid(&r.user_id)?)
            .bind(r.title)
            .execute(&self.pool)
            .await
            .map_err(db_err)?;
        Ok(Response::new(RenameChatSessionReply { ok: true }))
    }

    async fn delete_chat_session(
        &self,
        req: Request<DeleteChatSessionRequest>,
    ) -> Result<Response<DeleteChatSessionReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        sqlx::query("DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2")
            .bind(parse_uuid(&r.id)?)
            .bind(parse_uuid(&r.user_id)?)
            .execute(&self.pool)
            .await
            .map_err(db_err)?;
        Ok(Response::new(DeleteChatSessionReply { ok: true }))
    }

    async fn append_chat_message(
        &self,
        req: Request<AppendChatMessageRequest>,
    ) -> Result<Response<AppendChatMessageReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        if r.role != "user" && r.role != "assistant" {
            return Err(Status::invalid_argument("role must be user|assistant"));
        }
        let mut tx = self.pool.begin().await.map_err(db_err)?;
        sqlx::query(
            "INSERT INTO chat_messages (session_id, role, content) \
             SELECT $1, $3, $4 WHERE EXISTS (SELECT 1 FROM chat_sessions WHERE id = $1 AND user_id = $2)",
        )
        .bind(parse_uuid(&r.session_id)?)
        .bind(parse_uuid(&r.user_id)?)
        .bind(&r.role)
        .bind(&r.content)
        .execute(&mut *tx)
        .await
        .map_err(db_err)?;
        sqlx::query("UPDATE chat_sessions SET updated_at = now() WHERE id = $1")
            .bind(parse_uuid(&r.session_id)?)
            .execute(&mut *tx)
            .await
            .map_err(db_err)?;
        tx.commit().await.map_err(db_err)?;
        Ok(Response::new(AppendChatMessageReply { ok: true }))
    }

    async fn list_chat_messages(
        &self,
        req: Request<ListChatMessagesRequest>,
    ) -> Result<Response<ListChatMessagesReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let session = parse_uuid(&r.session_id)?;
        let user = parse_uuid(&r.user_id)?;
        let rows: Vec<(String, String, String)> = if r.limit <= 0 {
            sqlx::query_as(
                "SELECT m.role, m.content, m.created_at::text FROM chat_messages m \
                 JOIN chat_sessions s ON s.id = m.session_id \
                 WHERE m.session_id = $1 AND s.user_id = $2 ORDER BY m.created_at ASC",
            )
            .bind(session)
            .bind(user)
            .fetch_all(&self.pool)
            .await
            .map_err(db_err)?
        } else {
            sqlx::query_as(
                "SELECT m.role, m.content, m.created_at::text FROM chat_messages m \
                 JOIN chat_sessions s ON s.id = m.session_id \
                 WHERE m.session_id = $1 AND s.user_id = $2 ORDER BY m.created_at ASC LIMIT $3",
            )
            .bind(session)
            .bind(user)
            .bind(r.limit as i64)
            .fetch_all(&self.pool)
            .await
            .map_err(db_err)?
        };
        Ok(Response::new(ListChatMessagesReply {
            messages: rows
                .into_iter()
                .map(|(role, content, created_at)| ChatMessage { role, content, created_at })
                .collect(),
        }))
    }

    // --- PS162: FIRMS / GIS ---

    async fn upsert_firms_point(
        &self,
        req: Request<UpsertFirmsPointRequest>,
    ) -> Result<Response<UpsertFirmsPointReply>, Status> {
        self.authorize(&req)?;
        let p = req
            .into_inner()
            .point
            .ok_or_else(|| Status::invalid_argument("point required"))?;
        let id = if p.id.is_empty() { Uuid::new_v4() } else { parse_uuid(&p.id)? };
        sqlx::query(
            "INSERT INTO firms_points (
                id, geom, acq_date, acq_time, latitude, longitude,
                bright_ti4, bright_ti5, frp, confidence, satellite, bright_t31, scan, track,
                landcover, dist_industrial_m, inside_industrial, osm_id, persistence_score,
                predicted_class, industrial_prob, cluster_id
            ) VALUES (
                $1, ST_SetSRID(ST_MakePoint($5, $4), 4326), $2::date, NULLIF($3,'')::time, $4, $5,
                $6, $7, $8, $9, $10, $11, $12, $13,
                NULLIF($14,0)::smallint, $15, $16, NULLIF($17,0), $18,
                $19, $20, NULLIF($21,'')::uuid
            )
            ON CONFLICT (id) DO UPDATE SET
                geom = EXCLUDED.geom, acq_date = EXCLUDED.acq_date, acq_time = EXCLUDED.acq_time,
                latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
                bright_ti4 = EXCLUDED.bright_ti4, bright_ti5 = EXCLUDED.bright_ti5, frp = EXCLUDED.frp,
                confidence = EXCLUDED.confidence, satellite = EXCLUDED.satellite, bright_t31 = EXCLUDED.bright_t31,
                scan = EXCLUDED.scan, track = EXCLUDED.track, landcover = EXCLUDED.landcover,
                dist_industrial_m = EXCLUDED.dist_industrial_m, inside_industrial = EXCLUDED.inside_industrial,
                osm_id = EXCLUDED.osm_id, persistence_score = EXCLUDED.persistence_score,
                predicted_class = EXCLUDED.predicted_class, industrial_prob = EXCLUDED.industrial_prob,
                cluster_id = EXCLUDED.cluster_id",
        )
        .bind(id)
        .bind(&p.acq_date)
        .bind(&p.acq_time)
        .bind(p.latitude)
        .bind(p.longitude)
        .bind(p.bright_ti4)
        .bind(p.bright_ti5)
        .bind(p.frp)
        .bind(&p.confidence)
        .bind(&p.satellite)
        .bind(p.bright_t31)
        .bind(p.scan)
        .bind(p.track)
        .bind(p.landcover)
        .bind(p.dist_industrial_m)
        .bind(p.inside_industrial)
        .bind(p.osm_id)
        .bind(p.persistence_score)
        .bind(&p.predicted_class)
        .bind(p.industrial_prob)
        .bind(&p.cluster_id)
        .execute(&self.pool)
        .await
        .map_err(db_err)?;
        Ok(Response::new(UpsertFirmsPointReply { id: id.to_string() }))
    }

    async fn list_firms_points(
        &self,
        req: Request<ListFirmsPointsRequest>,
    ) -> Result<Response<ListFirmsPointsReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let limit = if r.limit <= 0 { 500 } else { r.limit.clamp(1, 5000) } as i64;
        let rows = sqlx::query(
            "SELECT id, latitude, longitude, acq_date::text AS acq_date,
                    COALESCE(acq_time::text,'') AS acq_time,
                    COALESCE(bright_ti4,0) AS bright_ti4, COALESCE(bright_ti5,0) AS bright_ti5,
                    COALESCE(frp,0) AS frp, COALESCE(confidence,'') AS confidence,
                    COALESCE(satellite,'') AS satellite, COALESCE(bright_t31,0) AS bright_t31,
                    COALESCE(scan,0) AS scan, COALESCE(track,0) AS track,
                    COALESCE(landcover,0)::int AS landcover, COALESCE(dist_industrial_m,0) AS dist_industrial_m,
                    COALESCE(inside_industrial,false) AS inside_industrial, COALESCE(osm_id,0) AS osm_id,
                    COALESCE(persistence_score,0) AS persistence_score,
                    COALESCE(predicted_class,'') AS predicted_class, COALESCE(industrial_prob,0) AS industrial_prob,
                    COALESCE(cluster_id::text,'') AS cluster_id
             FROM firms_points
             WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
               AND ($5 = '' OR acq_date >= $5::date)
               AND ($6 = '' OR acq_date <= $6::date)
               AND ($7 = '' OR predicted_class = $7)
               AND ($9 = '' OR cluster_id::text = $9)
             ORDER BY acq_date DESC
             LIMIT $8",
        )
        .bind(r.min_lon)
        .bind(r.min_lat)
        .bind(r.max_lon)
        .bind(r.max_lat)
        .bind(&r.date_from)
        .bind(&r.date_to)
        .bind(&r.predicted_class)
        .bind(limit)
        .bind(&r.cluster_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_err)?;
        let points = rows
            .into_iter()
            .map(|row| FirmsPoint {
                id: row.get::<Uuid, _>("id").to_string(),
                latitude: row.get("latitude"),
                longitude: row.get("longitude"),
                acq_date: row.get("acq_date"),
                acq_time: row.get("acq_time"),
                bright_ti4: row.get("bright_ti4"),
                bright_ti5: row.get("bright_ti5"),
                frp: row.get("frp"),
                confidence: row.get("confidence"),
                satellite: row.get("satellite"),
                bright_t31: row.get("bright_t31"),
                scan: row.get("scan"),
                track: row.get("track"),
                landcover: row.get("landcover"),
                dist_industrial_m: row.get("dist_industrial_m"),
                inside_industrial: row.get("inside_industrial"),
                osm_id: row.get("osm_id"),
                persistence_score: row.get("persistence_score"),
                predicted_class: row.get("predicted_class"),
                industrial_prob: row.get("industrial_prob"),
                cluster_id: row.get("cluster_id"),
            })
            .collect();
        Ok(Response::new(ListFirmsPointsReply { points }))
    }

    async fn update_firms_point_classification(
        &self,
        req: Request<UpdateFirmsPointClassificationRequest>,
    ) -> Result<Response<UpdateFirmsPointClassificationReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let id = parse_uuid(&r.id)?;
        sqlx::query(
            "UPDATE firms_points SET
                predicted_class = $2, industrial_prob = $3, persistence_score = $4,
                dist_industrial_m = $5, inside_industrial = $6, landcover = NULLIF($7,0)::smallint,
                cluster_id = COALESCE(NULLIF($8,'')::uuid, cluster_id)
             WHERE id = $1",
        )
        .bind(id)
        .bind(&r.predicted_class)
        .bind(r.industrial_prob)
        .bind(r.persistence_score)
        .bind(r.dist_industrial_m)
        .bind(r.inside_industrial)
        .bind(r.landcover)
        .bind(&r.cluster_id)
        .execute(&self.pool)
        .await
        .map_err(db_err)?;
        Ok(Response::new(UpdateFirmsPointClassificationReply { ok: true }))
    }

    async fn upsert_thermal_cluster(
        &self,
        req: Request<UpsertThermalClusterRequest>,
    ) -> Result<Response<UpsertThermalClusterReply>, Status> {
        self.authorize(&req)?;
        let c = req
            .into_inner()
            .cluster
            .ok_or_else(|| Status::invalid_argument("cluster required"))?;
        let id = if c.id.is_empty() { Uuid::new_v4() } else { parse_uuid(&c.id)? };
        sqlx::query(
            "INSERT INTO thermal_clusters (
                id, centroid, count, avg_frp, max_frp, persistence, first_seen, last_seen,
                predicted_class, osm_id, updated_at
             ) VALUES (
                $1, ST_SetSRID(ST_MakePoint($3, $2), 4326), $4, $5, $6, $7,
                NULLIF($8,'')::date, NULLIF($9,'')::date, $10, NULLIF($11,0), now()
             )
             ON CONFLICT (id) DO UPDATE SET
                centroid = EXCLUDED.centroid, count = EXCLUDED.count, avg_frp = EXCLUDED.avg_frp,
                max_frp = EXCLUDED.max_frp, persistence = EXCLUDED.persistence,
                first_seen = EXCLUDED.first_seen, last_seen = EXCLUDED.last_seen,
                predicted_class = EXCLUDED.predicted_class, osm_id = EXCLUDED.osm_id, updated_at = now()",
        )
        .bind(id)
        .bind(c.centroid_lat)
        .bind(c.centroid_lon)
        .bind(c.count)
        .bind(c.avg_frp)
        .bind(c.max_frp)
        .bind(c.persistence)
        .bind(&c.first_seen)
        .bind(&c.last_seen)
        .bind(&c.predicted_class)
        .bind(c.osm_id)
        .execute(&self.pool)
        .await
        .map_err(db_err)?;
        Ok(Response::new(UpsertThermalClusterReply { id: id.to_string() }))
    }

    async fn list_thermal_clusters(
        &self,
        req: Request<ListThermalClustersRequest>,
    ) -> Result<Response<ListThermalClustersReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let rows = sqlx::query(
            "SELECT id, ST_Y(centroid) AS lat, ST_X(centroid) AS lon, count,
                    COALESCE(avg_frp,0) AS avg_frp, COALESCE(max_frp,0) AS max_frp,
                    COALESCE(persistence,0) AS persistence,
                    COALESCE(first_seen::text,'') AS first_seen, COALESCE(last_seen::text,'') AS last_seen,
                    COALESCE(predicted_class,'') AS predicted_class, COALESCE(osm_id,0) AS osm_id
             FROM thermal_clusters
             WHERE centroid && ST_MakeEnvelope($1, $2, $3, $4, 4326)
             ORDER BY last_seen DESC NULLS LAST
             LIMIT 500",
        )
        .bind(r.min_lon)
        .bind(r.min_lat)
        .bind(r.max_lon)
        .bind(r.max_lat)
        .fetch_all(&self.pool)
        .await
        .map_err(db_err)?;
        let clusters = rows
            .into_iter()
            .map(|row| ThermalCluster {
                id: row.get::<Uuid, _>("id").to_string(),
                centroid_lat: row.get("lat"),
                centroid_lon: row.get("lon"),
                count: row.get("count"),
                avg_frp: row.get("avg_frp"),
                max_frp: row.get("max_frp"),
                persistence: row.get("persistence"),
                first_seen: row.get("first_seen"),
                last_seen: row.get("last_seen"),
                predicted_class: row.get("predicted_class"),
                osm_id: row.get("osm_id"),
            })
            .collect();
        Ok(Response::new(ListThermalClustersReply { clusters }))
    }

    async fn upsert_industrial_site(
        &self,
        req: Request<UpsertIndustrialSiteRequest>,
    ) -> Result<Response<UpsertIndustrialSiteReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        sqlx::query(
            "INSERT INTO industrial_sites (osm_id, centroid, tags, industrial_type, name)
             VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326), NULLIF($4,'')::jsonb, $5, $6)
             ON CONFLICT (osm_id) DO UPDATE SET
                centroid = EXCLUDED.centroid, tags = EXCLUDED.tags,
                industrial_type = EXCLUDED.industrial_type, name = EXCLUDED.name",
        )
        .bind(r.osm_id)
        .bind(r.centroid_lat)
        .bind(r.centroid_lon)
        .bind(&r.tags_json)
        .bind(&r.industrial_type)
        .bind(&r.name)
        .execute(&self.pool)
        .await
        .map_err(db_err)?;
        Ok(Response::new(UpsertIndustrialSiteReply { ok: true }))
    }

    async fn nearest_industrial_site(
        &self,
        req: Request<NearestIndustrialSiteRequest>,
    ) -> Result<Response<NearestIndustrialSiteReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let row = sqlx::query(
            "SELECT osm_id, COALESCE(industrial_type,'') AS industrial_type,
                    ST_Distance(centroid::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS dist_m
             FROM industrial_sites
             ORDER BY centroid <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)
             LIMIT 1",
        )
        .bind(r.lat)
        .bind(r.lon)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_err)?;
        Ok(Response::new(match row {
            Some(row) => {
                let dist_m: f64 = row.get("dist_m");
                NearestIndustrialSiteReply {
                    found: true,
                    osm_id: row.get("osm_id"),
                    dist_m,
                    inside: dist_m < 50.0, // v1: distance threshold, no polygon containment yet
                    industrial_type: row.get("industrial_type"),
                }
            }
            None => NearestIndustrialSiteReply::default(),
        }))
    }

    async fn insert_label_event(
        &self,
        req: Request<InsertLabelEventRequest>,
    ) -> Result<Response<InsertLabelEventReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let cluster_id = parse_uuid(&r.cluster_id)?;
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO label_events (
                id, cluster_id, source, label, confidence, matched_article_url, matched_article_title
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(id)
        .bind(cluster_id)
        .bind(&r.source)
        .bind(&r.label)
        .bind(r.confidence)
        .bind(&r.matched_article_url)
        .bind(&r.matched_article_title)
        .execute(&self.pool)
        .await
        .map_err(db_err)?;
        Ok(Response::new(InsertLabelEventReply { id: id.to_string() }))
    }

    async fn list_label_events(
        &self,
        req: Request<ListLabelEventsRequest>,
    ) -> Result<Response<ListLabelEventsReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let limit = if r.limit <= 0 { 500 } else { r.limit.min(5000) };
        let rows = if r.cluster_id.is_empty() {
            sqlx::query(
                "SELECT id, cluster_id, source, label, confidence,
                        matched_article_url, matched_article_title, created_at::text AS created_at
                 FROM label_events ORDER BY created_at DESC LIMIT $1",
            )
            .bind(limit)
            .fetch_all(&self.pool)
            .await
        } else {
            let cluster_id = parse_uuid(&r.cluster_id)?;
            sqlx::query(
                "SELECT id, cluster_id, source, label, confidence,
                        matched_article_url, matched_article_title, created_at::text AS created_at
                 FROM label_events WHERE cluster_id = $1 ORDER BY created_at DESC LIMIT $2",
            )
            .bind(cluster_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
        }
        .map_err(db_err)?;
        let events = rows
            .into_iter()
            .map(|row| LabelEvent {
                id: row.get::<Uuid, _>("id").to_string(),
                cluster_id: row.get::<Uuid, _>("cluster_id").to_string(),
                source: row.get("source"),
                label: row.get("label"),
                confidence: row.get("confidence"),
                matched_article_url: row.get("matched_article_url"),
                matched_article_title: row.get("matched_article_title"),
                created_at: row.get("created_at"),
            })
            .collect();
        Ok(Response::new(ListLabelEventsReply { events }))
    }

    async fn upsert_document(
        &self,
        req: Request<UpsertDocumentRequest>,
    ) -> Result<Response<UpsertDocumentReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let embedding = vector_literal(&r.embedding);
        let row = sqlx::query(
            "INSERT INTO documents (collection, title, content, embedding)
             VALUES ($1, $2, $3, $4::vector) RETURNING id",
        )
        .bind(&r.collection)
        .bind(&r.title)
        .bind(&r.content)
        .bind(&embedding)
        .fetch_one(&self.pool)
        .await
        .map_err(db_err)?;
        let id: i64 = row.get("id");
        Ok(Response::new(UpsertDocumentReply { id: id.to_string() }))
    }

    async fn query_documents(
        &self,
        req: Request<QueryDocumentsRequest>,
    ) -> Result<Response<QueryDocumentsReply>, Status> {
        self.authorize(&req)?;
        let r = req.into_inner();
        let embedding = vector_literal(&r.embedding);
        let k: i64 = if r.k <= 0 { 5 } else { r.k.min(50) as i64 };
        let rows = sqlx::query(
            "SELECT id, COALESCE(title,'') AS title, content,
                    1 - (embedding <=> $1::vector) AS score
             FROM documents WHERE collection = $2
             ORDER BY embedding <=> $1::vector LIMIT $3",
        )
        .bind(&embedding)
        .bind(&r.collection)
        .bind(k)
        .fetch_all(&self.pool)
        .await
        .map_err(db_err)?;
        let matches = rows
            .into_iter()
            .map(|row| {
                let id: i64 = row.get("id");
                let score: f64 = row.get("score");
                DocumentMatch {
                    id: id.to_string(),
                    title: row.get("title"),
                    content: row.get("content"),
                    score: score as f32,
                }
            })
            .collect();
        Ok(Response::new(QueryDocumentsReply { matches }))
    }
}

/// Formats an embedding as pgvector's text input syntax ("[0.1,0.2,...]").
/// No pgvector Rust crate needed - pgvector accepts this via a `::vector`
/// cast on a plain text-bound parameter, same "raw SQL, no ORM" style as
/// the rest of this file.
fn vector_literal(v: &[f32]) -> String {
    let mut s = String::with_capacity(v.len() * 8 + 2);
    s.push('[');
    for (i, f) in v.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&f.to_string());
    }
    s.push(']');
    s
}

fn parse_uuid(s: &str) -> Result<Uuid, Status> {
    Uuid::parse_str(s).map_err(|_| Status::invalid_argument("expected uuid"))
}

fn db_err(e: sqlx::Error) -> Status {
    tracing::warn!("db error: {e}");
    Status::internal("database error")
}
