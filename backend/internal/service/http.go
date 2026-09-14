package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"dlottery/backend/internal/indexer"
	"dlottery/backend/internal/store"
)

type Config struct {
	ChainID            string `json:"chainId"`
	LotteryAddress     string `json:"lotteryAddress"`
	TokenAddress       string `json:"tokenAddress"`
	TokenDecimals      uint8  `json:"tokenDecimals"`
	DAOAddress         string `json:"daoAddress"`
	RandomnessProvider string `json:"randomnessProvider"`
	DeploymentBlock    int64  `json:"deploymentBlock"`
	RPCURL             string `json:"-"`
	Confirmations      uint64 `json:"confirmations"`
}
type Server struct {
	Store   *store.Store
	Indexer *indexer.Indexer
	Config  Config
	Origins []string
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { reply(w, 200, map[string]any{"ok": true}) })
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("GET /metrics", s.metrics)
	mux.HandleFunc("GET /api/v1/config", func(w http.ResponseWriter, r *http.Request) { reply(w, 200, s.Config) })
	mux.HandleFunc("GET /api/v1/draws/current", s.current)
	mux.HandleFunc("GET /api/v1/draws/history", s.history)
	mux.HandleFunc("GET /api/v1/draws/{id}", s.detail)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 12)
		_, _ = rand.Read(b)
		id := hex.EncodeToString(b)
		w.Header().Set("X-Request-ID", id)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		origin := r.Header.Get("Origin")
		allowed := origin == ""
		for _, o := range s.Origins {
			if origin == o {
				allowed = true
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				break
			}
		}
		if !allowed {
			problem(w, 403, "Origin is not allowed")
			return
		}
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(204)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("request panic", "requestId", id)
				problem(w, 500, "Internal server error")
			}
		}()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}
func reply(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func problem(w http.ResponseWriter, status int, message string) {
	reply(w, status, map[string]any{"error": map[string]string{"message": message, "requestId": w.Header().Get("X-Request-ID")}})
}
func (s *Server) healthy() bool {
	state := s.Indexer.State()
	return state.Synced && !state.Recovering && !state.LastSuccess.IsZero() && time.Since(state.LastSuccess) < 60*time.Second
}
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	if !s.healthy() || s.Store.Pool.Ping(r.Context()) != nil {
		reply(w, 503, map[string]any{"ready": false, "sync": s.Indexer.State()})
		return
	}
	reply(w, 200, map[string]any{"ready": true, "sync": s.Indexer.State()})
}
func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	v := s.Indexer.State()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "dlottery_observed_head %d\ndlottery_indexed_block %d\ndlottery_indexer_failures_total %d\ndlottery_reorgs_total %d\ndlottery_indexer_lag %d\n", v.ObservedHead, v.IndexedBlock, v.Failures, v.Reorgs, max(int64(0), v.SafeHead-v.IndexedBlock))
}
func (s *Server) respond(w http.ResponseWriter, r *http.Request, mode, id, cursor string, limit int) {
	if s.Indexer.State().Recovering {
		problem(w, 503, "Chain recovery in progress; retry shortly")
		return
	}
	snap, err := s.Store.Read(r.Context(), mode, id, cursor, limit)
	if err != nil {
		slog.Error("database read failed", "requestId", w.Header().Get("X-Request-ID"))
		problem(w, 503, "History service temporarily unavailable")
		return
	}
	state := s.Indexer.State()
	synced := s.healthy() && snap.Cursor >= state.SafeHead
	out := map[string]any{"chainId": s.Config.ChainID, "lotteryAddress": s.Config.LotteryAddress, "tokenAddress": s.Config.TokenAddress, "tokenDecimals": s.Config.TokenDecimals, "indexedBlock": snap.Cursor, "indexedBlockHash": snap.Hash, "chainTime": snap.ChainTime, "observedHead": state.ObservedHead, "synced": synced, "sync": state}
	if mode == "history" {
		out["draws"] = snap.Draws
		out["nextCursor"] = snap.NextCursor
	} else {
		out["draw"] = nil
		if len(snap.Draws) > 0 {
			out["draw"] = snap.Draws[0]
		} else if mode == "detail" {
			problem(w, 404, "Draw not found")
			return
		}
	}
	reply(w, 200, out)
}
func (s *Server) current(w http.ResponseWriter, r *http.Request) {
	s.respond(w, r, "current", "", "", 1)
}
func validID(id string) bool {
	if id == "" || strings.TrimLeft(id, "0123456789") != "" || len(id) > 78 {
		return false
	}
	n, ok := new(big.Int).SetString(id, 10)
	return ok && n.Sign() > 0 && n.BitLen() <= 256
}
func (s *Server) detail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validID(id) {
		problem(w, 400, "Draw ID must be a positive uint256 decimal string")
		return
	}
	s.respond(w, r, "detail", id, "", 1)
}
func (s *Server) history(w http.ResponseWriter, r *http.Request) {
	limit := 20
	raw := r.URL.Query().Get("limit")
	if raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > 100 {
			problem(w, 400, "limit must be between 1 and 100")
			return
		}
		limit = v
	}
	cursor := r.URL.Query().Get("cursor")
	if cursor != "" && !validID(cursor) {
		problem(w, 400, "Invalid cursor")
		return
	}
	s.respond(w, r, "history", "", cursor, limit)
}
