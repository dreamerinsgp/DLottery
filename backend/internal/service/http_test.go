package service_test

import (
	"context"
	"dlottery/backend/internal/indexer"
	"dlottery/backend/internal/service"
	"dlottery/backend/internal/testutil"
	"encoding/json"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"math/big"
	"net/http/httptest"
	"testing"
)

func TestQueriesPaginationAndValidation(t *testing.T) {
	s := testutil.Store(t)
	ctx := context.Background()
	h := testutil.Header(1, common.Hash{}, "a")
	var logs []types.Log
	for id := int64(1); id <= 3; id++ {
		logs = append(logs, testutil.Start(t, h, id, uint(len(logs))), testutil.Log(t, h, "DrawCancelled", id, uint(len(logs)+1), uint8(0), big.NewInt(0), big.NewInt(0)))
	}
	if err := s.CommitBlock(ctx, testutil.Block(h), testutil.Events(t, h, logs...)); err != nil {
		t.Fatal(err)
	}
	api := (&service.Server{Store: s, Indexer: &indexer.Indexer{}, Config: service.Config{ChainID: "31337"}, Origins: []string{"http://localhost:5173"}}).Handler()
	for _, tc := range []struct {
		path   string
		status int
	}{{"/api/v1/draws/current", 200}, {"/api/v1/draws/1", 200}, {"/api/v1/draws/4", 404}, {"/api/v1/draws/0", 400}, {"/api/v1/draws/history?limit=0", 400}, {"/api/v1/draws/history?cursor=-1", 400}, {"/readyz", 503}, {"/healthz", 200}} {
		r := httptest.NewRequest("GET", tc.path, nil)
		w := httptest.NewRecorder()
		api.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%s: %d %s", tc.path, w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	api.ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/draws/history?limit=2", nil))
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nextCursor"] != "2" || len(body["draws"].([]any)) != 2 {
		t.Fatal("bad first page", body)
	}
	w = httptest.NewRecorder()
	api.ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/draws/history?limit=2&cursor=2", nil))
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body["nextCursor"] != nil || len(body["draws"].([]any)) != 1 {
		t.Fatal("bad second page", body)
	}
	r := httptest.NewRequest("GET", "/api/v1/draws/current", nil)
	r.Header.Set("Origin", "https://untrusted.example")
	w = httptest.NewRecorder()
	api.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("CORS not enforced")
	}
}
