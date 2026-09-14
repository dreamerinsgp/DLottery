package store_test

import (
	"context"
	"dlottery/backend/internal/store"
	"dlottery/backend/internal/testutil"
	"github.com/ethereum/go-ethereum/common"
	"testing"
)

func TestAtomicBlockAndRetry(t *testing.T) {
	s := testutil.Store(t)
	ctx := context.Background()
	h := testutil.Header(1, common.Hash{}, "a")
	b := testutil.Block(h)
	bad := testutil.Events(t, h, testutil.Start(t, h, 1, 0), testutil.Ticket(t, h, 1, 1), testutil.Ticket(t, h, 1, 2))
	if err := s.CommitBlock(ctx, b, bad); err == nil {
		t.Fatal("invalid event should roll back block")
	}
	cursor, _, _ := s.Cursor(ctx)
	if cursor != 0 {
		t.Fatal("cursor advanced past failure")
	}
	snap, err := s.Read(ctx, "current", "", "", 1)
	if err != nil || len(snap.Draws) != 0 {
		t.Fatal("partial draw committed", err)
	}
	good := bad[:2]
	good = append(good, good[1]) // Duplicate RPC delivery in the same batch.
	if err = s.CommitBlock(ctx, b, good); err != nil {
		t.Fatal(err)
	}
	if err = s.CommitBlock(ctx, b, good); err != nil {
		t.Fatal(err)
	}
	snap, err = s.Read(ctx, "current", "", "", 1)
	if err != nil || snap.Draws[0].ParticipantCount != 1 || snap.Draws[0].Pool != "10" {
		t.Fatal("duplicate changed totals", err)
	}
	reopened, err := store.Open(ctx, s.Pool.Config().ConnString(), s.Identity, 1)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	cursor, _, err = reopened.Cursor(ctx)
	if err != nil || cursor != 1 {
		t.Fatal("restart lost cursor", err)
	}
}
func TestRewindRebuildAndSingleWriter(t *testing.T) {
	s := testutil.Store(t)
	ctx := context.Background()
	if err := s.Lock(ctx); err != nil {
		t.Fatal(err)
	}
	second, err := store.Open(ctx, s.Pool.Config().ConnString(), s.Identity, 1)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	if second.Lock(ctx) == nil {
		t.Fatal("second writer acquired lock")
	}
	h1 := testutil.Header(1, common.Hash{}, "a")
	h2 := testutil.Header(2, h1.Hash(), "a")
	if err = s.CommitBlock(ctx, testutil.Block(h1), testutil.Events(t, h1, testutil.Start(t, h1, 1, 0))); err != nil {
		t.Fatal(err)
	}
	if err = s.CommitBlock(ctx, testutil.Block(h2), testutil.Events(t, h2, testutil.Ticket(t, h2, 1, 0))); err != nil {
		t.Fatal(err)
	}
	if err = s.Rewind(ctx, 1); err != nil {
		t.Fatal(err)
	}
	snap, err := s.Read(ctx, "current", "", "", 1)
	if err != nil || snap.Draws[0].Pool != "0" || snap.Cursor != 1 {
		t.Fatal("orphan purchase survived", err)
	}
	if err = s.Rewind(ctx, 0); err != nil {
		t.Fatal(err)
	}
	snap, _ = s.Read(ctx, "current", "", "", 1)
	if len(snap.Draws) != 0 {
		t.Fatal("deep reset retained projection")
	}
}

func TestUint256Precision(t *testing.T) {
	s := testutil.Store(t)
	ctx := context.Background()
	h := testutil.Header(1, common.Hash{}, "precision")
	events := testutil.Events(t, h, testutil.Start(t, h, 1, 0))
	huge := "115792089237316195423570985008687907853269984665640564039457584007913129639935"
	events[0].Values["drawId"] = huge
	events[0].Values["inheritedRollover"] = huge
	if err := s.CommitBlock(ctx, testutil.Block(h), events); err != nil {
		t.Fatal(err)
	}
	snap, err := s.Read(ctx, "detail", huge, "", 1)
	if err != nil || snap.Draws[0].ID != huge || snap.Draws[0].Pool != huge {
		t.Fatal("uint256 precision lost", err)
	}
}
