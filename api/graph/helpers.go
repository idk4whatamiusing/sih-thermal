package graph

import (
	"context"
	"errors"
	"log"
	"strconv"
	"time"

	app "github.com/idk4whatamiusing/meridian_stack/api"
	"github.com/idk4whatamiusing/meridian_stack/api/internal/oauth"
	"github.com/idk4whatamiusing/meridian_stack/api/internal/store"
	aipb "github.com/idk4whatamiusing/meridian_stack/api/pb/aipb"
	dbpb "github.com/idk4whatamiusing/meridian_stack/api/pb/dbpb"
)

var errUnauthorized = errors.New("unauthorized: login first (mutation { login(email) })")

// resolver wrappers (normally generated; kept here since we own schema.resolvers.go)
type (
	mutationResolver     struct{ *Resolver }
	queryResolver        struct{ *Resolver }
	subscriptionResolver struct{ *Resolver }
)

func sourceFromPB(s *aipb.Source) *app.Source {
	if s == nil {
		return nil
	}
	t := s.Title
	return &app.Source{ID: s.Id, Title: &t, Text: s.Text, Score: float64(s.Score)}
}

func toAppMessages(msgs []store.Message) []*app.Message {
	out := make([]*app.Message, len(msgs))
	for i, m := range msgs {
		out[i] = &app.Message{Role: m.Role, Content: m.Content, CreatedAt: m.CreatedAt}
	}
	return out
}

func dbUsersKey(n int) string          { return store.Hash("db", "users", itoa(n)) }
func dbSessionsKey(user string) string { return store.Hash("db", "sessions", user) }

func dbFirmsPointsKey(bbox app.BoundingBox, from, to, class string, limit int) string {
	return store.Hash("db", "firms_points", bboxKey(bbox), from, to, class, itoa(limit))
}

func dbThermalClustersKey(bbox app.BoundingBox) string {
	return store.Hash("db", "thermal_clusters", bboxKey(bbox))
}

func bboxKey(b app.BoundingBox) string {
	return ftoa(b.MinLat) + "," + ftoa(b.MinLon) + "," + ftoa(b.MaxLat) + "," + ftoa(b.MaxLon)
}

func ftoa(f float64) string { return strconv.FormatFloat(f, 'f', 4, 64) }

func firmsPointFromPB(p *dbpb.FirmsPoint) *app.FirmsPoint {
	var clusterID *string
	if p.ClusterId != "" {
		id := p.ClusterId
		clusterID = &id
	}
	osmID := ""
	if p.OsmId != 0 {
		osmID = strconv.FormatInt(p.OsmId, 10)
	}
	return &app.FirmsPoint{
		ID: p.Id, Latitude: p.Latitude, Longitude: p.Longitude, AcqDate: p.AcqDate, AcqTime: p.AcqTime,
		BrightTi4: p.BrightTi4, BrightTi5: p.BrightTi5, Frp: p.Frp, Confidence: p.Confidence, Satellite: p.Satellite,
		Landcover: int(p.Landcover), DistIndustrialM: p.DistIndustrialM, InsideIndustrial: p.InsideIndustrial,
		OsmID: osmID, PersistenceScore: p.PersistenceScore, PredictedClass: p.PredictedClass,
		IndustrialProb: p.IndustrialProb, ClusterID: clusterID,
	}
}

func thermalClusterFromPB(c *dbpb.ThermalCluster) *app.ThermalCluster {
	var osmID *string
	if c.OsmId != 0 {
		id := strconv.FormatInt(c.OsmId, 10)
		osmID = &id
	}
	return &app.ThermalCluster{
		ID: c.Id, CentroidLat: c.CentroidLat, CentroidLon: c.CentroidLon, Count: int(c.Count),
		AvgFrp: c.AvgFrp, MaxFrp: c.MaxFrp, Persistence: c.Persistence, FirstSeen: c.FirstSeen,
		LastSeen: c.LastSeen, PredictedClass: c.PredictedClass, OsmID: osmID,
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

// recordTurn persists a user/assistant turn: Postgres primary via db gRPC,
// then appends into the 7d Redis history cache if that session is cached.
// An empty sessionID (support box) lands on the per-user thread instead.
func (r *Resolver) recordTurn(ctx context.Context, user, sessionID, userMsg, assistantMsg string) {
	if assistantMsg == "" && userMsg == "" {
		return
	}
	sid := sessionID
	if sid == "" {
		sid = oauth.UserID(ctx)
	}
	cctx := r.Clients.Ctx(ctx)
	if _, err := r.Clients.DB.AppendChatMessage(cctx, &dbpb.AppendChatMessageRequest{
		SessionId: sid, UserId: user, Role: "user", Content: userMsg,
	}); err != nil {
		log.Printf("append user msg: %v", err)
	}
	if _, err := r.Clients.DB.AppendChatMessage(cctx, &dbpb.AppendChatMessageRequest{
		SessionId: sid, UserId: user, Role: "assistant", Content: assistantMsg,
	}); err != nil {
		log.Printf("append assistant msg: %v", err)
	}
	if msgs, ok := r.Store.HistoryCached(ctx, sid); ok {
		msgs = append(msgs,
			store.Message{Role: "user", Content: userMsg, CreatedAt: nowRFC3339()},
			store.Message{Role: "assistant", Content: assistantMsg, CreatedAt: nowRFC3339()},
		)
		r.Store.SetHistory(ctx, sid, msgs)
	}
}

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }

func (r *Resolver) Mutation() MutationResolver         { return &mutationResolver{r} }
func (r *Resolver) Query() QueryResolver               { return &queryResolver{r} }
func (r *Resolver) Subscription() SubscriptionResolver { return &subscriptionResolver{r} }
