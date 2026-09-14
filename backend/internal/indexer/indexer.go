package indexer

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"
	"sort"
	"sync"
	"time"

	"dlottery/backend/internal/lottery"
	"dlottery/backend/internal/store"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

type Chain interface {
	BlockNumber(context.Context) (uint64, error)
	HeaderByNumber(context.Context, *big.Int) (*types.Header, error)
	FilterLogs(context.Context, ethereum.FilterQuery) ([]types.Log, error)
}
type State struct {
	ObservedHead int64     `json:"observedHead"`
	SafeHead     int64     `json:"safeHead"`
	IndexedBlock int64     `json:"indexedBlock"`
	Recovering   bool      `json:"recovering"`
	Synced       bool      `json:"synced"`
	LastSuccess  time.Time `json:"lastSuccess"`
	Failures     uint64    `json:"failures"`
	Reorgs       uint64    `json:"reorgs"`
}
type Indexer struct {
	Store         *store.Store
	Chain         Chain
	Address       common.Address
	Confirmations uint64
	Poll          time.Duration
	mu            sync.RWMutex
	state         State
}

func (i *Indexer) State() State           { i.mu.RLock(); defer i.mu.RUnlock(); return i.state }
func (i *Indexer) update(fn func(*State)) { i.mu.Lock(); defer i.mu.Unlock(); fn(&i.state) }
func (i *Indexer) Run(ctx context.Context) {
	delay := time.Duration(0)
	for {
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		attempt, cancel := context.WithTimeout(ctx, 45*time.Second)
		err := i.Sync(attempt)
		cancel()
		if err != nil {
			i.update(func(s *State) { s.Failures++; s.Synced = false })
			slog.Error("indexer attempt failed; durable cursor retained", "error", safeError(err))
			if delay < i.Poll {
				delay = i.Poll
			}
			delay *= 2
			if delay > 30*time.Second {
				delay = 30 * time.Second
			}
		} else {
			delay = i.Poll
		}
	}
}

// RPC clients may include their URL in errors. Do not put credentials in logs.
func safeError(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	for _, marker := range []string{"http://", "https://", "postgres://", "postgresql://"} {
		for n := index(s, marker); n >= 0; n = index(s, marker) {
			end := n
			for end < len(s) && s[end] != ' ' && s[end] != '\n' {
				end++
			}
			s = s[:n] + "[endpoint]" + s[end:]
		}
	}
	return s
}
func index(s, sub string) int {
	for j := 0; j+len(sub) <= len(s); j++ {
		if s[j:j+len(sub)] == sub {
			return j
		}
	}
	return -1
}
func (i *Indexer) Sync(ctx context.Context) error {
	if err := i.Store.CheckLock(ctx); err != nil {
		return err
	}
	head, err := i.Chain.BlockNumber(ctx)
	if err != nil {
		return err
	}
	safe := int64(head) - int64(i.Confirmations)
	i.update(func(s *State) { s.ObservedHead = int64(head); s.SafeHead = safe; s.Synced = false })
	cursor, hash, err := i.Store.Cursor(ctx)
	if err != nil {
		return err
	}
	// Validate the old canonical tip even when no new confirmed blocks exist.
	if cursor >= i.Store.Start {
		ancestor := cursor
		if ancestor > int64(head) {
			ancestor = int64(head)
		}
		for ancestor >= i.Store.Start {
			canonical, e := i.Chain.HeaderByNumber(ctx, big.NewInt(ancestor))
			if e != nil {
				return e
			}
			old, e := i.Store.Block(ctx, ancestor)
			if e != nil {
				return e
			}
			if canonical.Hash().Hex() == old.Hash {
				break
			}
			ancestor--
		}
		ancestor = max(ancestor, i.Store.Start-1)
		if ancestor < cursor {
			i.update(func(s *State) { s.Recovering = true; s.Reorgs++ })
			if err = i.Store.Rewind(ctx, ancestor); err != nil {
				return err
			}
			cursor, hash, err = i.Store.Cursor(ctx)
			if err != nil {
				return err
			}
			slog.Warn("canonical chain changed; projections rebuilt", "ancestor", ancestor)
		}
	}
	i.update(func(s *State) { s.Recovering = false })
	// Each request is bounded to one block. This avoids public RPC range limits.
	// Limit work per pass so shutdown and health state remain responsive.
	for processed := 0; cursor < safe && processed < 100; processed++ {
		next := cursor + 1
		header, e := i.Chain.HeaderByNumber(ctx, big.NewInt(next))
		if e != nil {
			return e
		}
		if hash != "" && header.ParentHash.Hex() != hash {
			return fmt.Errorf("parent changed during scan; retry canonical validation")
		}
		blockHash := header.Hash()
		logs, e := i.Chain.FilterLogs(ctx, ethereum.FilterQuery{BlockHash: &blockHash, Addresses: []common.Address{i.Address}})
		if e != nil {
			return e
		}
		sort.Slice(logs, func(a, b int) bool {
			if logs[a].TxIndex != logs[b].TxIndex {
				return logs[a].TxIndex < logs[b].TxIndex
			}
			return logs[a].Index < logs[b].Index
		})
		events := make([]lottery.Event, 0, len(logs))
		for _, l := range logs {
			if l.Removed || l.Address != i.Address || l.BlockHash != blockHash || l.BlockNumber != uint64(next) {
				return fmt.Errorf("noncanonical RPC log")
			}
			decoded, e := lottery.Decode(l, header.Time)
			if e != nil {
				return e
			}
			events = append(events, decoded)
		}
		// Recheck header after fetching logs to avoid committing a known orphan.
		current, e := i.Chain.HeaderByNumber(ctx, big.NewInt(next))
		if e != nil {
			return e
		}
		if current.Hash() != blockHash {
			return fmt.Errorf("block changed during log fetch")
		}
		if e = i.Store.CommitBlock(ctx, store.Block{Number: next, Hash: blockHash.Hex(), ParentHash: header.ParentHash.Hex(), Timestamp: header.Time}, events); e != nil {
			return e
		}
		cursor = next
		hash = blockHash.Hex()
		i.update(func(s *State) { s.IndexedBlock = cursor })
	}
	i.update(func(s *State) { s.IndexedBlock = cursor; s.Synced = cursor >= safe; s.LastSuccess = time.Now() })
	return nil
}
