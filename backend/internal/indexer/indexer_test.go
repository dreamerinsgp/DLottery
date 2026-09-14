package indexer_test

import (
	"context"
	"dlottery/backend/internal/indexer"
	"dlottery/backend/internal/testutil"
	"fmt"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"math/big"
	"testing"
	"time"
)

type fakeChain struct {
	head    uint64
	headers map[int64]*types.Header
	logs    map[common.Hash][]types.Log
	fail    bool
}

func (f *fakeChain) BlockNumber(context.Context) (uint64, error) {
	if f.fail {
		return 0, fmt.Errorf("RPC unavailable")
	}
	return f.head, nil
}
func (f *fakeChain) HeaderByNumber(_ context.Context, n *big.Int) (*types.Header, error) {
	h := f.headers[n.Int64()]
	if h == nil {
		return nil, fmt.Errorf("missing header")
	}
	return h, nil
}
func (f *fakeChain) FilterLogs(_ context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
	return f.logs[*q.BlockHash], nil
}
func TestConfirmationsOutageReorgAndEmptyBlocks(t *testing.T) {
	s := testutil.Store(t)
	ctx := context.Background()
	if err := s.Lock(ctx); err != nil {
		t.Fatal(err)
	}
	h1 := testutil.Header(1, common.Hash{}, "a")
	h2 := testutil.Header(2, h1.Hash(), "a")
	h3 := testutil.Header(3, h2.Hash(), "a")
	chain := &fakeChain{head: 3, headers: map[int64]*types.Header{1: h1, 2: h2, 3: h3}, logs: map[common.Hash][]types.Log{h1.Hash(): {testutil.Start(t, h1, 1, 0)}, h2.Hash(): {testutil.Ticket(t, h2, 1, 0)}}}
	idx := &indexer.Indexer{Store: s, Chain: chain, Address: testutil.Address, Confirmations: 2, Poll: time.Millisecond}
	if err := idx.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	snap, _ := s.Read(ctx, "current", "", "", 1)
	if snap.Cursor != 1 || snap.Draws[0].ParticipantCount != 0 {
		t.Fatal("confirmation depth ignored")
	}
	idx.Confirmations = 0
	if err := idx.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	snap, _ = s.Read(ctx, "current", "", "", 1)
	if snap.Cursor != 3 || snap.Draws[0].ParticipantCount != 1 {
		t.Fatal("empty block not persisted")
	}
	chain.fail = true
	if idx.Sync(ctx) == nil {
		t.Fatal("outage ignored")
	}
	cursor, _, _ := s.Cursor(ctx)
	if cursor != 3 {
		t.Fatal("outage mutated cursor")
	}
	chain.fail = false
	replacement2 := testutil.Header(2, h1.Hash(), "b")
	replacement3 := testutil.Header(3, replacement2.Hash(), "b")
	chain.headers[2] = replacement2
	chain.headers[3] = replacement3
	if err := idx.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	snap, _ = s.Read(ctx, "current", "", "", 1)
	if snap.Draws[0].ParticipantCount != 0 || snap.Cursor != 3 || idx.State().Reorgs != 1 {
		t.Fatal("reorg did not remove orphan")
	}
	// A node that has lost the tip must also rewind old effects before extension.
	chain.head = 1
	if err := idx.Sync(ctx); err != nil {
		t.Fatal(err)
	}
	cursor, _, _ = s.Cursor(ctx)
	if cursor != 1 {
		t.Fatal("head decrease ignored")
	}
}
func TestDecodeFailureDoesNotAdvance(t *testing.T) {
	s := testutil.Store(t)
	ctx := context.Background()
	_ = s.Lock(ctx)
	h := testutil.Header(1, common.Hash{}, "a")
	bad := testutil.Start(t, h, 1, 0)
	bad.Data = []byte{1}
	chain := &fakeChain{head: 1, headers: map[int64]*types.Header{1: h}, logs: map[common.Hash][]types.Log{h.Hash(): {bad}}}
	idx := &indexer.Indexer{Store: s, Chain: chain, Address: testutil.Address}
	if idx.Sync(ctx) == nil {
		t.Fatal("malformed event ignored")
	}
	cursor, _, _ := s.Cursor(ctx)
	if cursor != 0 {
		t.Fatal("cursor skipped failure")
	}
	chain.logs[h.Hash()] = []types.Log{testutil.Start(t, h, 1, 0)}
	if err := idx.Sync(ctx); err != nil {
		t.Fatal(err)
	}
}
