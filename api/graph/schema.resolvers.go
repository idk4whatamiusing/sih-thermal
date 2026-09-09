package graph

// This file is maintained by hand; gqlgen keeps unknown code on regeneration.

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	app "github.com/idk4whatamiusing/meridian_stack/api"
	"github.com/idk4whatamiusing/meridian_stack/api/internal/oauth"
	"github.com/idk4whatamiusing/meridian_stack/api/internal/store"
	aipb "github.com/idk4whatamiusing/meridian_stack/api/pb/aipb"
	dbpb "github.com/idk4whatamiusing/meridian_stack/api/pb/dbpb"
)

// ---- mutations ----

func (r *mutationResolver) Login(ctx context.Context, email string) (*app.User, error) {
	if email == "" {
		email = "dev@example.com"
	}
	id := uuid.NewString()
	if err := r.Store.CreateSession(ctx, id, email); err != nil {
		return nil, err
	}
	if _, err := r.Clients.DB.UpsertUser(r.Clients.Ctx(ctx), &dbpb.UpsertUserRequest{Id: id, Email: email}); err != nil {
		log.Printf("upsert user: %v", err)
	}
	oauth.SetSessionCookie(ctx, id)
	return &app.User{ID: id, Email: email}, nil
}

func (r *mutationResolver) Logout(ctx context.Context) (bool, error) {
	if id := oauth.UserID(ctx); id != "" {
		_ = r.Store.DeleteSession(ctx, id)
	}
	oauth.ClearSessionCookie(ctx)
	return true, nil
}

func (r *mutationResolver) Broadcast(ctx context.Context, message string) (bool, error) {
	r.Hub.Broadcast("api: " + message) // parallel fanout #1: local subscribers
	r.Clients.NotifyRealtime(message)  // parallel fanout #2: gleam realtime (best-effort)
	return true, nil
}

func (r *mutationResolver) CreateChatSession(ctx context.Context, title *string) (*app.ChatSession, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return nil, errUnauthorized
	}
	id := uuid.NewString()
	t := "New chat"
	if title != nil && *title != "" {
		t = *title
	}
	if _, err := r.Clients.DB.CreateChatSession(r.Clients.Ctx(ctx), &dbpb.CreateChatSessionRequest{Id: id, UserId: user, Title: t}); err != nil {
		return nil, err
	}
	r.Store.Del(ctx, dbSessionsKey(user))
	now := time.Now().UTC().Format(time.RFC3339)
	return &app.ChatSession{ID: id, Title: t, Pinned: false, UpdatedAt: now}, nil
}

func (r *mutationResolver) RenameSession(ctx context.Context, id string, title string) (bool, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return false, errUnauthorized
	}
	_, err := r.Clients.DB.RenameChatSession(r.Clients.Ctx(ctx), &dbpb.RenameChatSessionRequest{Id: id, UserId: user, Title: title})
	r.Store.Del(ctx, dbSessionsKey(user))
	return err == nil, err
}

func (r *mutationResolver) DeleteSession(ctx context.Context, id string) (bool, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return false, errUnauthorized
	}
	_, err := r.Clients.DB.DeleteChatSession(r.Clients.Ctx(ctx), &dbpb.DeleteChatSessionRequest{Id: id, UserId: user})
	r.Store.Del(ctx, dbSessionsKey(user))
	r.Store.DropHistory(ctx, id)
	return err == nil, err
}

func (r *mutationResolver) Chat(ctx context.Context, sessionID string, message string, provider *string) (*app.ChatReply, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return nil, errUnauthorized
	}
	var prov string
	if provider != nil {
		prov = *provider
	}
	reply, err := r.Clients.Ai.Chat(r.Clients.Ctx(ctx), &aipb.ChatRequest{
		Message: message, UseRag: true, UserId: user, SessionId: sessionID, Provider: prov,
	})
	if err != nil {
		return nil, err
	}
	r.recordTurn(ctx, user, sessionID, message, reply.Reply)
	sources := make([]*app.Source, len(reply.Sources))
	for i, s := range reply.Sources {
		sources[i] = sourceFromPB(s)
	}
	return &app.ChatReply{Reply: reply.Reply, Model: reply.Model, Sources: sources, Cached: reply.Cached}, nil
}

func (r *mutationResolver) SupportQuery(ctx context.Context, message string) (*app.ChatReply, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return nil, errUnauthorized
	}
	stream, err := r.Clients.Ai.SupportQuery(r.Clients.Ctx(ctx), &aipb.SupportQueryRequest{Message: message, UserId: user})
	if err != nil {
		return nil, err
	}
	text, sources := drainSupport(stream)
	r.recordTurn(ctx, user, "", message, text)
	return &app.ChatReply{Reply: text, Model: "tinyllama-q4", Sources: sources}, nil
}

func (r *mutationResolver) IngestSupport(ctx context.Context, documents []string) (int, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return 0, errUnauthorized
	}
	rep, err := r.Clients.Ai.Ingest(r.Clients.Ctx(ctx), &aipb.IngestRequest{Documents: documents, Collection: "support"})
	if err != nil {
		return 0, err
	}
	return int(rep.Chunks), nil
}

func (r *mutationResolver) UpsertFirmsPoint(ctx context.Context, point app.FirmsPointInput) (string, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return "", errUnauthorized
	}
	pb := &dbpb.FirmsPoint{
		Id: point.ID, Latitude: point.Latitude, Longitude: point.Longitude,
		AcqDate: point.AcqDate, BrightTi4: point.BrightTi4, BrightTi5: point.BrightTi5,
		Frp: point.Frp, Confidence: point.Confidence, Satellite: point.Satellite,
	}
	if point.AcqTime != nil {
		pb.AcqTime = *point.AcqTime
	}
	if point.BrightT31 != nil {
		pb.BrightT31 = *point.BrightT31
	}
	if point.Scan != nil {
		pb.Scan = *point.Scan
	}
	if point.Track != nil {
		pb.Track = *point.Track
	}
	rep, err := r.Clients.DB.UpsertFirmsPoint(r.Clients.Ctx(ctx), &dbpb.UpsertFirmsPointRequest{Point: pb})
	if err != nil {
		return "", err
	}
	return rep.Id, nil
}

func (r *mutationResolver) UpdateFirmsPointClassification(ctx context.Context, id string, predictedClass string, industrialProb float64, persistenceScore float64, distIndustrialM float64, insideIndustrial bool, landcover int, clusterID *string) (bool, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return false, errUnauthorized
	}
	cid := ""
	if clusterID != nil {
		cid = *clusterID
	}
	_, err := r.Clients.DB.UpdateFirmsPointClassification(r.Clients.Ctx(ctx), &dbpb.UpdateFirmsPointClassificationRequest{
		Id: id, PredictedClass: predictedClass, IndustrialProb: industrialProb, PersistenceScore: persistenceScore,
		DistIndustrialM: distIndustrialM, InsideIndustrial: insideIndustrial, Landcover: int32(landcover), ClusterId: cid,
	})
	return err == nil, err
}

// ---- queries ----

func (r *queryResolver) Me(ctx context.Context) (*app.User, error) {
	id := oauth.UserID(ctx)
	if id == "" {
		return nil, nil
	}
	email, _ := r.Store.SessionEmail(ctx, id)
	return &app.User{ID: id, Email: email}, nil
}

func (r *queryResolver) Users(ctx context.Context, limit *int) ([]*app.User, error) {
	n := 50
	if limit != nil {
		n = *limit
	}
	key := dbUsersKey(n)
	var cached []*app.User
	if r.Store.GetJSON(ctx, key, &cached) && cached != nil {
		return cached, nil // Redis 7d fast path
	}
	rep, err := r.Clients.DB.ListUsers(r.Clients.Ctx(ctx), &dbpb.ListUsersRequest{Limit: int32(n)})
	if err != nil {
		return nil, err
	}
	users := make([]*app.User, len(rep.Users))
	for i, u := range rep.Users {
		users[i] = &app.User{ID: u.Id, Email: u.Email}
	}
	r.Store.SetJSON(ctx, key, users)
	return users, nil
}

func (r *queryResolver) Health(ctx context.Context) (string, error) { return "ok", nil }

func (r *queryResolver) ChatSessions(ctx context.Context) ([]*app.ChatSession, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return []*app.ChatSession{}, nil
	}
	key := dbSessionsKey(user)
	var cached []*app.ChatSession
	if r.Store.GetJSON(ctx, key, &cached) && cached != nil {
		return cached, nil
	}
	rep, err := r.Clients.DB.ListChatSessions(r.Clients.Ctx(ctx), &dbpb.ListChatSessionsRequest{UserId: user})
	if err != nil {
		return nil, err
	}
	sessions := make([]*app.ChatSession, len(rep.Sessions))
	for i, s := range rep.Sessions {
		sessions[i] = &app.ChatSession{ID: s.Id, Title: s.Title, Pinned: s.Pinned, UpdatedAt: s.UpdatedAt}
	}
	r.Store.SetJSON(ctx, key, sessions)
	return sessions, nil
}

func (r *queryResolver) ChatHistory(ctx context.Context, sessionID string) ([]*app.Message, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return nil, errUnauthorized
	}
	if msgs, ok := r.Store.HistoryCached(ctx, sessionID); ok {
		return toAppMessages(msgs), nil // Redis 7d fast path
	}
	rep, err := r.Clients.DB.ListChatMessages(r.Clients.Ctx(ctx), &dbpb.ListChatMessagesRequest{
		SessionId: sessionID, UserId: user,
	})
	if err != nil {
		return nil, err
	}
	msgs := make([]store.Message, 0, len(rep.Messages))
	out := make([]*app.Message, 0, len(rep.Messages))
	for _, m := range rep.Messages {
		msgs = append(msgs, store.Message{Role: m.Role, Content: m.Content, CreatedAt: m.CreatedAt})
		out = append(out, &app.Message{Role: m.Role, Content: m.Content, CreatedAt: m.CreatedAt})
	}
	r.Store.SetHistory(ctx, sessionID, msgs)
	return out, nil
}

func (r *queryResolver) FirmsPoints(ctx context.Context, bbox app.BoundingBox, dateFrom *string, dateTo *string, predictedClass *string, limit *int) ([]*app.FirmsPoint, error) {
	n := 500
	if limit != nil {
		n = *limit
	}
	from, to, class := "", "", ""
	if dateFrom != nil {
		from = *dateFrom
	}
	if dateTo != nil {
		to = *dateTo
	}
	if predictedClass != nil {
		class = *predictedClass
	}
	key := dbFirmsPointsKey(bbox, from, to, class, n)
	var cached []*app.FirmsPoint
	if r.Store.GetJSON(ctx, key, &cached) && cached != nil {
		return cached, nil // Redis 7d fast path
	}
	rep, err := r.Clients.DB.ListFirmsPoints(r.Clients.Ctx(ctx), &dbpb.ListFirmsPointsRequest{
		MinLat: bbox.MinLat, MinLon: bbox.MinLon, MaxLat: bbox.MaxLat, MaxLon: bbox.MaxLon,
		DateFrom: from, DateTo: to, PredictedClass: class, Limit: int32(n),
	})
	if err != nil {
		return nil, err
	}
	points := make([]*app.FirmsPoint, len(rep.Points))
	for i, p := range rep.Points {
		points[i] = firmsPointFromPB(p)
	}
	r.Store.SetJSON(ctx, key, points)
	return points, nil
}

func (r *queryResolver) ThermalClusters(ctx context.Context, bbox app.BoundingBox) ([]*app.ThermalCluster, error) {
	key := dbThermalClustersKey(bbox)
	var cached []*app.ThermalCluster
	if r.Store.GetJSON(ctx, key, &cached) && cached != nil {
		return cached, nil // Redis 7d fast path
	}
	rep, err := r.Clients.DB.ListThermalClusters(r.Clients.Ctx(ctx), &dbpb.ListThermalClustersRequest{
		MinLat: bbox.MinLat, MinLon: bbox.MinLon, MaxLat: bbox.MaxLat, MaxLon: bbox.MaxLon,
	})
	if err != nil {
		return nil, err
	}
	clusters := make([]*app.ThermalCluster, len(rep.Clusters))
	for i, c := range rep.Clusters {
		clusters[i] = thermalClusterFromPB(c)
	}
	r.Store.SetJSON(ctx, key, clusters)
	return clusters, nil
}

// ---- subscriptions ----

func (r *subscriptionResolver) Events(ctx context.Context) (<-chan string, error) {
	ch := r.Hub.Subscribe()
	go func() {
		<-ctx.Done()
		r.Hub.Unsubscribe(ch)
	}()
	return ch, nil
}

func (r *subscriptionResolver) ChatStream(ctx context.Context, sessionID string, message string, provider *string) (<-chan *app.ChatChunk, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return nil, errUnauthorized
	}
	var prov string
	if provider != nil {
		prov = *provider
	}
	stream, err := r.Clients.Ai.ChatStream(r.Clients.Ctx(ctx), &aipb.ChatRequest{
		Message: message, UseRag: true, UserId: user, SessionId: sessionID, Provider: prov,
	})
	if err != nil {
		return nil, err
	}
	ch := make(chan *app.ChatChunk, 32)
	go func() {
		defer close(ch)
		var text string
		var firstSources []*app.Source
		for {
			chunk, err := stream.Recv()
			if err != nil {
				return
			}
			text += chunk.Delta
			firstSources = mergeSources(firstSources, chunk.Sources)
			select {
			case ch <- &app.ChatChunk{Delta: chunk.Delta, Done: chunk.Done, Sources: firstSources, Cached: chunk.Cached}:
			case <-ctx.Done():
				return
			}
			if chunk.Done {
				break
			}
		}
		r.recordTurn(ctx, oauth.UserID(ctx), sessionID, message, text)
	}()
	return ch, nil
}

func (r *subscriptionResolver) SupportStream(ctx context.Context, message string) (<-chan *app.ChatChunk, error) {
	user := oauth.UserID(ctx)
	if user == "" {
		return nil, errUnauthorized
	}
	stream, err := r.Clients.Ai.SupportQuery(r.Clients.Ctx(ctx), &aipb.SupportQueryRequest{Message: message, UserId: user})
	if err != nil {
		return nil, err
	}
	ch := make(chan *app.ChatChunk, 32)
	go func() {
		defer close(ch)
		var text string
		var firstSources []*app.Source
		for {
			chunk, err := stream.Recv()
			if err != nil {
				return
			}
			text += chunk.Delta
			firstSources = mergeSources(firstSources, chunk.Sources)
			select {
			case ch <- &app.ChatChunk{Delta: chunk.Delta, Done: chunk.Done, Sources: firstSources, Cached: chunk.Cached}:
			case <-ctx.Done():
				return
			}
			if chunk.Done {
				break
			}
		}
		r.recordTurn(ctx, oauth.UserID(ctx), "", message, text)
	}()
	return ch, nil
}

// ---- helpers ----

func drainSupport(stream aipb.Ai_SupportQueryClient) (string, []*app.Source) {
	var text string
	var firstSources []*app.Source
	for {
		chunk, err := stream.Recv()
		if err != nil {
			break
		}
		text += chunk.Delta
		firstSources = mergeSources(firstSources, chunk.Sources)
		if chunk.Done {
			break
		}
	}
	return text, firstSources
}

func mergeSources(current []*app.Source, pbSources []*aipb.Source) []*app.Source {
	if len(pbSources) == 0 || current != nil {
		return current
	}
	out := make([]*app.Source, len(pbSources))
	for i, s := range pbSources {
		out[i] = sourceFromPB(s)
	}
	return out
}
