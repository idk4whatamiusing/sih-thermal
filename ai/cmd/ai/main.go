package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/idk4whatamiusing/meridian_stack/ai/internal/firms"
	"github.com/idk4whatamiusing/meridian_stack/ai/internal/providers"
	"github.com/idk4whatamiusing/meridian_stack/ai/internal/rag"
	aipb "github.com/idk4whatamiusing/meridian_stack/api/pb/aipb"
	dbpb "github.com/idk4whatamiusing/meridian_stack/api/pb/dbpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/metadata"
)

const (
	supportThreshold = 0.92 // knowledge-base answers repeat a lot
	chatThreshold    = 0.95
	topK             = 5
)

type server struct {
	aipb.UnimplementedAiServer
	rag      *rag.Client
	firms    *firms.Client
	db       dbpb.DbClient
	dbSecret string
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func sourcesFromRAG(in []rag.Source) []*aipb.Source {
	out := make([]*aipb.Source, len(in))
	for i, s := range in {
		out[i] = &aipb.Source{Id: s.Id, Title: deref(s.Title), Text: s.Text, Score: s.Score}
	}
	return out
}

func sourcesHash(in []rag.Source) string {
	h := ""
	for _, s := range in {
		h += s.Id + "|"
	}
	return fmt.Sprintf("%x", h)
}

func (s *server) chatMessages(message, system string, useRAG bool) []providers.Message {
	if !useRAG {
		msgs := []providers.Message{}
		if system != "" {
			msgs = append(msgs, providers.Message{Role: "system", Content: system})
		}
		return append(msgs, providers.Message{Role: "user", Content: message})
	}
	return []providers.Message{{Role: "user", Content: message}}
}

func (s *server) Chat(ctx context.Context, req *aipb.ChatRequest) (*aipb.ChatReply, error) {
	kind, threshold := "chat", chatThreshold
	collection := "chat"
	if req.GetProvider() == "support" {
		kind, threshold, collection = "support", supportThreshold, "support"
	}
	user := req.GetUserId()

	if hit := s.rag.CacheLookup(kind, user, req.GetMessage(), threshold); hit.Hit {
		return &aipb.ChatReply{Reply: hit.Answer, Model: "cache", Cached: true}, nil
	}

	var sources []rag.Source
	var ctxText string
	if req.GetUseRag() {
		srcs, err := s.retrieveDocs(ctx, req.GetMessage(), collection, topK)
		if err == nil && len(srcs) > 0 {
			sources = srcs
			var b strings.Builder
			b.WriteString("Answer ONLY using these sources:\n")
			for _, sc := range srcs {
				fmt.Fprintf(&b, "\n[%s]\n%s\n", deref(sc.Title), sc.Text)
			}
			ctxText = b.String()
		}
	}

	gen, model := providers.Provider(context.Background())
	msgs := buildMsgs(systemOrDefault(req.GetSystem()), ctxText, req.GetMessage())
	stream, err := gen(msgs)
	if err != nil {
		return nil, err
	}
	var reply strings.Builder
	for c := range stream {
		reply.WriteString(c.Delta)
	}
	ans := reply.String()
	s.rag.CacheStore(kind, user, req.GetMessage(), ans, sourcesHash(sources))
	return &aipb.ChatReply{
		Reply:   ans,
		Model:   model,
		Sources: sourcesFromRAG(sources),
	}, nil
}

func (s *server) ChatStream(req *aipb.ChatRequest, stream aipb.Ai_ChatStreamServer) error {
	rep, err := s.Chat(stream.Context(), req)
	if err != nil {
		return err
	}
	if rep.Cached {
		_ = stream.Send(&aipb.ChatChunk{Delta: rep.Reply, Done: true, Cached: true})
		return nil
	}
	gen, _ := providers.Provider(context.Background())
	msgs := buildMsgs(systemOrDefault(req.GetSystem()), "", req.GetMessage())
	ch, err := gen(msgs)
	if err != nil {
		return err
	}
	first := true
	for c := range ch {
		ck := &aipb.ChatChunk{Delta: c.Delta, Done: c.Done}
		if first {
			ck.Sources = rep.Sources // RAG ran before streaming; attach on first chunk
			first = false
		}
		if err := stream.Send(ck); err != nil {
			return err
		}
		if c.Done {
			break
		}
	}
	s.rag.CacheStore("chat", req.GetUserId(), req.GetMessage(), rep.Reply, "")
	return nil
}

func (s *server) SupportQuery(req *aipb.SupportQueryRequest, stream aipb.Ai_SupportQueryServer) error {
	msg := req.GetMessage()
	user := req.GetUserId()

	if hit := s.rag.CacheLookup("support", user, msg, supportThreshold); hit.Hit {
		return stream.Send(&aipb.SupportChunk{Delta: hit.Answer, Done: true, Cached: true})
	}

	sources, err := s.retrieveDocs(stream.Context(), msg, "support", topK)
	if err != nil || len(sources) == 0 {
		return stream.Send(&aipb.SupportChunk{
			Delta: "I could not find anything in the knowledge base for that. Try rephrasing or contact a human.",
			Done:  true,
		})
	}

	var b strings.Builder
	b.WriteString("You are a support assistant. Answer ONLY from the knowledge base below. If it is not covered, say you don't know.\n\nKnowledge base:\n")
	for _, sc := range sources {
		fmt.Fprintf(&b, "\n[%s]\n%s\n", deref(sc.Title), sc.Text)
	}

	llmURL := envOr("SUPPORT_LLM_URL", "http://localhost:8081") + "/v1"
	openaiGen := providers.OpenAIStream(llmURL, envOr("SUPPORT_LLM_KEY", ""), envOr("SUPPORT_LLM_MODEL", "tinyllama"))
	ch, err := openaiGen([]providers.Message{
		{Role: "system", Content: b.String()},
		{Role: "user", Content: msg},
	})
	if err != nil {
		return stream.Send(&aipb.SupportChunk{
			Delta: "Support LLM is not reachable (" + err.Error() + "). Start it with `make support-llm`.",
			Done:  true,
		})
	}
	var answer strings.Builder
	first := true
	for c := range ch {
		ck := &aipb.SupportChunk{Delta: c.Delta, Done: c.Done}
		if first {
			ck.Sources = sourcesFromRAG(sources)
			first = false
		}
		answer.WriteString(c.Delta)
		if err := stream.Send(ck); err != nil {
			return err
		}
		if c.Done {
			break
		}
	}
	s.rag.CacheStore("support", user, msg, answer.String(), sourcesHash(sources))
	return nil
}

func (s *server) Ingest(ctx context.Context, req *aipb.IngestRequest) (*aipb.IngestReply, error) {
	n, err := s.ingestDocs(ctx, req.GetDocuments(), collectionOr(req.GetCollection()))
	if err != nil {
		return nil, err
	}
	return &aipb.IngestReply{Chunks: int32(n)}, nil
}

// retrieveDocs embeds query via the Python sidecar, then finds similar
// documents via db.QueryDocuments (pgvector cosine similarity in Postgres -
// Python never touches Postgres directly).
func (s *server) retrieveDocs(ctx context.Context, query, collection string, k int) ([]rag.Source, error) {
	emb, err := s.rag.Embed(query)
	if err != nil {
		return nil, err
	}
	dctx := metadata.AppendToOutgoingContext(ctx, "x-backend-secret", s.dbSecret)
	rep, err := s.db.QueryDocuments(dctx, &dbpb.QueryDocumentsRequest{Collection: collection, Embedding: emb, K: int32(k)})
	if err != nil {
		return nil, err
	}
	out := make([]rag.Source, len(rep.Matches))
	for i, m := range rep.Matches {
		title := m.Title
		out[i] = rag.Source{Id: m.Id, Title: &title, Text: m.Content, Score: m.Score}
	}
	return out, nil
}

// ingestDocs embeds each document then stores it via db.UpsertDocument. No
// chunking - each string in `documents` is stored as one document, same
// granularity the caller already controls (matches the pre-existing
// "IngestFull" naming/behavior, not a regression introduced here).
func (s *server) ingestDocs(ctx context.Context, documents []string, collection string) (int, error) {
	dctx := metadata.AppendToOutgoingContext(ctx, "x-backend-secret", s.dbSecret)
	n := 0
	for _, doc := range documents {
		emb, err := s.rag.Embed(doc)
		if err != nil {
			log.Printf("ingestDocs: embed: %v", err)
			continue
		}
		if _, err := s.db.UpsertDocument(dctx, &dbpb.UpsertDocumentRequest{Collection: collection, Content: doc, Embedding: emb}); err != nil {
			log.Printf("ingestDocs: upsert: %v", err)
			continue
		}
		n++
	}
	return n, nil
}

func (s *server) Predict(ctx context.Context, req *aipb.PredictRequest) (*aipb.PredictReply, error) {
	t := strings.ToLower(req.GetText())
	switch {
	case containsAny(t, "bad", "terrible", "hate", "awful"):
		return &aipb.PredictReply{Label: "negative"}, nil
	case containsAny(t, "great", "love", "good", "nice"):
		return &aipb.PredictReply{Label: "positive"}, nil
	default:
		return &aipb.PredictReply{Label: "neutral"}, nil
	}
}

// classifyEnrich fills in dist_industrial_m/inside_industrial via
// db.NearestIndustrialSite when the caller didn't supply them, then calls
// the Python classifier. Shared by ClassifyFirmsPoint and the IngestFirms
// pipeline so both go through the same enrichment path.
func (s *server) classifyEnrich(ctx context.Context, preq *firms.PredictRequest) (firms.PredictReply, error) {
	if preq.DistIndustrialM == nil || preq.InsideIndustrial == nil {
		nctx := metadata.AppendToOutgoingContext(ctx, "x-backend-secret", s.dbSecret)
		nrep, err := s.db.NearestIndustrialSite(nctx, &dbpb.NearestIndustrialSiteRequest{Lat: preq.Lat, Lon: preq.Lon})
		if err != nil {
			log.Printf("nearest industrial site lookup: %v", err)
		} else if nrep.GetFound() {
			d, in := nrep.GetDistM(), nrep.GetInside()
			preq.DistIndustrialM, preq.InsideIndustrial = &d, &in
		}
	}
	return s.firms.Predict(*preq)
}

func (s *server) ClassifyFirmsPoint(ctx context.Context, req *aipb.ClassifyFirmsPointRequest) (*aipb.ClassifyFirmsPointReply, error) {
	preq := firms.PredictRequest{Lat: req.GetLat(), Lon: req.GetLon(), DistIndustrialM: req.DistIndustrialM, InsideIndustrial: req.InsideIndustrial}
	if req.GetFrp() != 0 {
		v := req.GetFrp()
		preq.Frp = &v
	}
	if req.GetBrightTi4() != 0 {
		v := req.GetBrightTi4()
		preq.BrightTi4 = &v
	}
	if req.GetBrightTi5() != 0 {
		v := req.GetBrightTi5()
		preq.BrightTi5 = &v
	}
	if req.GetConfidence() != "" {
		v := req.GetConfidence()
		preq.Confidence = &v
	}
	if req.GetSatellite() != "" {
		v := req.GetSatellite()
		preq.Satellite = &v
	}
	if req.GetPersistence() != 0 {
		v := req.GetPersistence()
		preq.Persistence = &v
	}
	preq.Landcover = req.Landcover

	rep, err := s.classifyEnrich(ctx, &preq)
	if err != nil {
		return nil, err
	}

	// Surface similar past cases on every result, not just ambiguous ones -
	// best-effort: a RAG miss shouldn't fail the classification itself.
	var similarCases []*aipb.Source
	summary := caseSummary(req.GetLat(), req.GetLon(), req.GetFrp(), preq.DistIndustrialM, rep.PredictedClass)
	if srcs, err := s.retrieveDocs(ctx, summary, "firms_cases", 3); err != nil {
		log.Printf("classify: retrieve similar cases: %v", err)
	} else {
		similarCases = sourcesFromRAG(srcs)
	}

	return &aipb.ClassifyFirmsPointReply{
		PredictedClass: rep.PredictedClass, IndustrialProb: rep.IndustrialProb,
		Persistence: rep.Persistence, Reasons: rep.Reasons, Landcover: rep.Landcover,
		SimilarCases: similarCases,
	}, nil
}

// caseSummary builds the text description embedded for RAG retrieval/storage
// of a case - used both for similarCases lookups (every classification) and
// for the firms_cases documents arbitrateCluster ingests (Phase 3b).
func caseSummary(lat, lon, frp float64, distM *float64, predictedClass string) string {
	dist := "unknown"
	if distM != nil {
		dist = fmt.Sprintf("%.0fm", *distM)
	}
	return fmt.Sprintf("Thermal detection at (%.4f, %.4f), FRP=%.1f, distance to nearest industrial site=%s, classified as %s.",
		lat, lon, frp, dist, predictedClass)
}

func (s *server) ClusterFirmsPoints(ctx context.Context, req *aipb.ClusterFirmsPointsRequest) (*aipb.ClusterFirmsPointsReply, error) {
	pts := make([]firms.ClusterPoint, len(req.GetPoints()))
	for i, p := range req.GetPoints() {
		cp := firms.ClusterPoint{Lat: p.GetLat(), Lon: p.GetLon()}
		if p.GetFrp() != 0 {
			v := p.GetFrp()
			cp.Frp = &v
		}
		pts[i] = cp
	}
	creq := firms.ClusterRequest{Points: pts, EpsM: 1000, MinSamples: 3, WindowDays: 30}
	if req.GetEpsM() != 0 {
		creq.EpsM = req.GetEpsM()
	}
	if req.GetMinSamples() != 0 {
		creq.MinSamples = int(req.GetMinSamples())
	}
	if req.GetWindowDays() != 0 {
		creq.WindowDays = int(req.GetWindowDays())
	}
	rep, err := s.firms.Cluster(creq)
	if err != nil {
		return nil, err
	}
	out := make([]*aipb.FirmsClusterPointOut, len(rep.Clusters))
	for i, c := range rep.Clusters {
		out[i] = &aipb.FirmsClusterPointOut{Lat: c.Lat, Lon: c.Lon, Cluster: int32(c.Cluster), Persistence: c.Persistence}
	}
	return &aipb.ClusterFirmsPointsReply{Clusters: out, NClusters: int32(rep.NClusters)}, nil
}

// firmsPointNamespace is a fixed UUID used to derive stable, idempotent
// FirmsPoint ids from (satellite, acq_date, acq_time, lat, lon) - so
// re-ingesting the same bbox/date range upserts rather than duplicates.
var firmsPointNamespace = uuid.MustParse("6f6a1e1a-2b0e-4a7a-9f2e-6b1c9d6e2a11")

func firmsPointID(satellite, acqDate, acqTime string, lat, lon float64) string {
	key := fmt.Sprintf("%s|%s|%s|%.5f|%.5f", satellite, acqDate, acqTime, lat, lon)
	return uuid.NewSHA1(firmsPointNamespace, []byte(key)).String()
}

// normalizeFirmsTime converts FIRMS's raw acq_time ("HHMM", not zero-padded,
// e.g. "102" = 01:02) into "HH:MM:SS" for the db's `time` column. Empty
// input stays empty (db treats "" as NULL).
func normalizeFirmsTime(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	for len(raw) < 4 {
		raw = "0" + raw
	}
	if len(raw) != 4 {
		return "" // unexpected shape - leave unset rather than send a bad value
	}
	return raw[:2] + ":" + raw[2:] + ":00"
}

// persistedFirmsPoint carries everything needed both to have written a
// FirmsPoint row and, later, to fold it into a thermal cluster + patch its
// cluster_id back in - so the training pipeline (Phase 2c) has something to
// join against instead of every ingested point sitting unclustered forever.
type persistedFirmsPoint struct {
	id                               string
	lat, lon, frp                    float64
	acqDate                          string
	predictedClass                   string
	industrialProb, persistenceScore float64
	distIndustrialM                  float64
	insideIndustrial                 bool
	landcover                        int32
}

func (s *server) IngestFirms(ctx context.Context, req *aipb.IngestFirmsRequest) (*aipb.IngestFirmsReply, error) {
	rep, err := s.firms.Ingest(firms.IngestRequest{
		MinLat: req.GetMinLat(), MinLon: req.GetMinLon(), MaxLat: req.GetMaxLat(), MaxLon: req.GetMaxLon(),
		DateFrom: req.GetDateFrom(), DateTo: req.GetDateTo(),
	})
	if err != nil {
		return nil, err
	}
	if !rep.Ok {
		return &aipb.IngestFirmsReply{Ok: false, Error: rep.Error}, nil
	}

	dctx := metadata.AppendToOutgoingContext(ctx, "x-backend-secret", s.dbSecret)
	var persisted []persistedFirmsPoint
	for _, p := range rep.Points {
		preq := &firms.PredictRequest{
			Lat: p.Lat, Lon: p.Lon, Frp: p.Frp, BrightTi4: p.BrightTi4, BrightTi5: p.BrightTi5,
			Confidence: p.Confidence, Satellite: p.Satellite,
		}
		crep, err := s.classifyEnrich(ctx, preq)
		if err != nil {
			log.Printf("ingest: classify (%f,%f): %v", p.Lat, p.Lon, err)
			continue
		}

		satellite := ""
		if p.Satellite != nil {
			satellite = *p.Satellite
		}
		confidence := ""
		if p.Confidence != nil {
			confidence = *p.Confidence
		}
		pp := persistedFirmsPoint{
			id: firmsPointID(satellite, p.AcqDate, p.AcqTime, p.Lat, p.Lon), lat: p.Lat, lon: p.Lon, acqDate: p.AcqDate,
			predictedClass: crep.PredictedClass, industrialProb: crep.IndustrialProb, persistenceScore: crep.Persistence,
		}
		if preq.DistIndustrialM != nil {
			pp.distIndustrialM = *preq.DistIndustrialM
		}
		if preq.InsideIndustrial != nil {
			pp.insideIndustrial = *preq.InsideIndustrial
		}
		if crep.Landcover != nil {
			pp.landcover = *crep.Landcover
		}
		if p.Frp != nil {
			pp.frp = *p.Frp
		}

		pb := &dbpb.FirmsPoint{
			Id: pp.id, Latitude: p.Lat, Longitude: p.Lon, AcqDate: p.AcqDate, AcqTime: normalizeFirmsTime(p.AcqTime),
			Confidence: confidence, Satellite: satellite,
			PredictedClass: pp.predictedClass, IndustrialProb: pp.industrialProb, PersistenceScore: pp.persistenceScore,
			DistIndustrialM: pp.distIndustrialM, InsideIndustrial: pp.insideIndustrial, Landcover: pp.landcover,
		}
		if p.BrightTi4 != nil {
			pb.BrightTi4 = *p.BrightTi4
		}
		if p.BrightTi5 != nil {
			pb.BrightTi5 = *p.BrightTi5
		}
		if p.Frp != nil {
			pb.Frp = *p.Frp
		}
		if p.Scan != nil {
			pb.Scan = *p.Scan
		}
		if p.Track != nil {
			pb.Track = *p.Track
		}

		if _, err := s.db.UpsertFirmsPoint(dctx, &dbpb.UpsertFirmsPointRequest{Point: pb}); err != nil {
			log.Printf("ingest: upsert (%f,%f): %v", p.Lat, p.Lon, err)
			continue
		}
		persisted = append(persisted, pp)
	}

	if len(persisted) > 0 {
		s.clusterAndTag(dctx, persisted)
	}
	return &aipb.IngestFirmsReply{Ok: true, PointsIngested: int32(len(persisted))}, nil
}

// clusterAndTag groups this ingestion batch's persisted points via the
// Python DBSCAN-ish clusterer, upserts a thermal_clusters row per group, and
// patches each member firms_point's cluster_id - this is what actually
// makes the Phase 2c training pipeline able to find sequence data (see
// issue #7: previously nothing called ClusterFirmsPoints during ingest, so
// firms_points.cluster_id was always null). Best-effort: logs and moves on
// on any single failure rather than aborting the whole ingest.
func (s *server) clusterAndTag(ctx context.Context, persisted []persistedFirmsPoint) {
	byKey := make(map[string]*persistedFirmsPoint, len(persisted))
	pts := make([]firms.ClusterPoint, len(persisted))
	for i := range persisted {
		p := &persisted[i]
		key := fmt.Sprintf("%.6f,%.6f", p.lat, p.lon)
		byKey[key] = p
		frp := p.frp
		pts[i] = firms.ClusterPoint{Lat: p.lat, Lon: p.lon, Frp: &frp}
	}
	crep, err := s.firms.Cluster(firms.ClusterRequest{Points: pts, EpsM: 1000, MinSamples: 2, WindowDays: 30})
	if err != nil {
		log.Printf("ingest: cluster: %v", err)
		return
	}

	groups := make(map[int][]*persistedFirmsPoint)
	for _, c := range crep.Clusters {
		if c.Cluster < 0 {
			continue // noise / unclustered
		}
		key := fmt.Sprintf("%.6f,%.6f", c.Lat, c.Lon)
		if p, ok := byKey[key]; ok {
			groups[c.Cluster] = append(groups[c.Cluster], p)
		}
	}

	for _, members := range groups {
		if len(members) == 0 {
			continue
		}
		var sumLat, sumLon, sumFrp, maxFrp float64
		classVotes := map[string]int{}
		minDate, maxDate := members[0].acqDate, members[0].acqDate
		ids := make([]string, len(members))
		for i, m := range members {
			sumLat += m.lat
			sumLon += m.lon
			sumFrp += m.frp
			if m.frp > maxFrp {
				maxFrp = m.frp
			}
			classVotes[m.predictedClass]++
			if m.acqDate < minDate {
				minDate = m.acqDate
			}
			if m.acqDate > maxDate {
				maxDate = m.acqDate
			}
			ids[i] = m.id
		}
		n := float64(len(members))
		majorityClass, majorityCount := "", 0
		for class, count := range classVotes {
			if count > majorityCount {
				majorityClass, majorityCount = class, count
			}
		}
		clusterID := thermalClusterID(ids)

		_, err := s.db.UpsertThermalCluster(ctx, &dbpb.UpsertThermalClusterRequest{Cluster: &dbpb.ThermalCluster{
			Id: clusterID, CentroidLat: sumLat / n, CentroidLon: sumLon / n, Count: int32(len(members)),
			AvgFrp: sumFrp / n, MaxFrp: maxFrp, FirstSeen: minDate, LastSeen: maxDate, PredictedClass: majorityClass,
		}})
		if err != nil {
			log.Printf("ingest: upsert thermal cluster: %v", err)
			continue
		}
		for _, m := range members {
			if _, err := s.db.UpdateFirmsPointClassification(ctx, &dbpb.UpdateFirmsPointClassificationRequest{
				Id: m.id, PredictedClass: m.predictedClass, IndustrialProb: m.industrialProb, PersistenceScore: m.persistenceScore,
				DistIndustrialM: m.distIndustrialM, InsideIndustrial: m.insideIndustrial, Landcover: m.landcover, ClusterId: clusterID,
			}); err != nil {
				log.Printf("ingest: tag cluster_id on point %s: %v", m.id, err)
			}
		}

		// Ambiguous clusters (heuristic majority vote landed on "unknown")
		// get a second opinion from an LLM, RAG-augmented with similar past
		// cases - this is the "hard case" arbitration from the pitch.
		if majorityClass == "unknown" {
			s.arbitrateCluster(ctx, clusterID, sumLat/n, sumLon/n, sumFrp/n, maxFrp, minDate, maxDate, len(members))
		}
	}
}

// arbitrateCluster asks the configured LLM provider (Cloudflare Workers AI
// by default, same integration Chat() already uses - no second LLM
// integration built for this) to classify a cluster the heuristic couldn't,
// augmented with similar past cases from the RAG store. The verdict is
// persisted as a label_events row with source="ai_worker", weighted lower
// than independently-sourced gdelt labels during training (schema.py's
// SOURCE_WEIGHT) - it is one more signal, never treated as ground truth,
// consistent with this project's explicit no-human-review design.
func (s *server) arbitrateCluster(ctx context.Context, clusterID string, lat, lon, avgFrp, maxFrp float64, firstSeen, lastSeen string, count int) {
	query := fmt.Sprintf("Persistent thermal cluster at (%.4f, %.4f): %d detections from %s to %s, avg FRP=%.1f, max FRP=%.1f.",
		lat, lon, count, firstSeen, lastSeen, avgFrp, maxFrp)
	similar, err := s.retrieveDocs(ctx, query, "firms_cases", 3)
	if err != nil {
		log.Printf("arbitrate %s: retrieve similar cases: %v", clusterID, err)
	}

	var b strings.Builder
	b.WriteString("You are classifying a satellite-detected thermal hotspot cluster. Respond with EXACTLY one line in the form:\n")
	b.WriteString("LABEL: <industrial_flare|thermal_power|mining|forest|agriculture|unknown>\n\n")
	b.WriteString(query)
	if len(similar) > 0 {
		b.WriteString("\n\nSimilar past cases:\n")
		for _, sc := range similar {
			fmt.Fprintf(&b, "- %s\n", sc.Text)
		}
	}

	gen, _ := providers.Provider(ctx)
	ch, err := gen([]providers.Message{{Role: "user", Content: b.String()}})
	if err != nil {
		log.Printf("arbitrate %s: llm call: %v", clusterID, err)
		return
	}
	var reply strings.Builder
	for c := range ch {
		reply.WriteString(c.Delta)
	}
	label := parseArbitrationLabel(reply.String())
	if label == "" {
		log.Printf("arbitrate %s: could not parse a label from LLM reply: %q", clusterID, reply.String())
		return
	}

	dctx := metadata.AppendToOutgoingContext(ctx, "x-backend-secret", s.dbSecret)
	if _, err := s.db.InsertLabelEvent(dctx, &dbpb.InsertLabelEventRequest{
		ClusterId: clusterID, Source: "ai_worker", Label: label, Confidence: 0.5,
	}); err != nil {
		log.Printf("arbitrate %s: insert label event: %v", clusterID, err)
		return
	}

	// Feed this case into the RAG store so future arbitrations (and every
	// classification's similarCases) can retrieve it.
	if _, err := s.ingestDocs(ctx, []string{query + " Arbitrated label: " + label + "."}, "firms_cases"); err != nil {
		log.Printf("arbitrate %s: ingest case into RAG store: %v", clusterID, err)
	}
}

var arbitrationLabels = []string{"industrial_flare", "thermal_power", "mining", "forest", "agriculture", "unknown"}

func parseArbitrationLabel(reply string) string {
	lower := strings.ToLower(reply)
	for _, l := range arbitrationLabels {
		if strings.Contains(lower, l) {
			return l
		}
	}
	return ""
}

// thermalClusterID derives a stable id from the member point ids so
// re-ingesting the same bbox/date range (same points, same ids) upserts the
// same cluster instead of creating a duplicate every run.
func thermalClusterID(memberIDs []string) string {
	sorted := append([]string(nil), memberIDs...)
	sort.Strings(sorted)
	return uuid.NewSHA1(firmsPointNamespace, []byte(strings.Join(sorted, "|"))).String()
}

// ---- small helpers ----

func buildMsgs(system, ragContext, message string) []providers.Message {
	var msgs []providers.Message
	sys := system
	if ragContext != "" {
		if sys != "" {
			sys += "\n\n" + ragContext
		} else {
			sys = ragContext
		}
	}
	if sys != "" {
		msgs = append(msgs, providers.Message{Role: "system", Content: sys})
	}
	return append(msgs, providers.Message{Role: "user", Content: message})
}

func systemOrDefault(s string) string {
	if s == "" {
		return "You are a concise assistant."
	}
	return s
}

func collectionOr(c string) string {
	if c == "" {
		return "support"
	}
	return c
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func containsAny(t string, words ...string) bool {
	for _, w := range words {
		if strings.Contains(t, w) {
			return true
		}
	}
	return false
}

func main() {
	go func() { // plain-HTTP health for compose probes
		mux := http.NewServeMux()
		mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })
		_ = http.ListenAndServe(":8081", mux)
	}()

	grpcAddr := envOr("AI_GRPC_LISTEN", ":8002")
	lis, err := net.Listen("tcp", grpcAddr)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("ai gRPC listening on %s (rag sidecar: %s)", grpcAddr, envOr("RAG_URL", "http://localhost:8003"))

	ragURL := envOr("RAG_URL", "http://localhost:8003")
	dbConn, err := grpc.NewClient(envOr("DB_GRPC_ADDR", "localhost:8010"), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatal(err)
	}
	s := &server{
		rag: rag.New(ragURL), firms: firms.New(envOr("FIRMS_URL", ragURL)),
		db: dbpb.NewDbClient(dbConn), dbSecret: envOr("BACKEND_SECRET", "change-me"),
	}
	gs := grpc.NewServer()
	aipb.RegisterAiServer(gs, s)
	hs := health.NewServer()
	hs.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(gs, hs)
	if err := gs.Serve(lis); err != nil {
		log.Fatal(err)
	}
}
