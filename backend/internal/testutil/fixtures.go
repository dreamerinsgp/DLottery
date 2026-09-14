package testutil

import (
	"context"
	"fmt"
	"math/big"
	"os"
	"testing"
	"time"

	"dlottery/backend/internal/lottery"
	"dlottery/backend/internal/store"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

var Address = common.HexToAddress("0x1234567890123456789012345678901234567890")
var Buyer = common.HexToAddress("0x1000000000000000000000000000000000000001")

func Store(t *testing.T) *store.Store {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; use npm run test:backend for PostgreSQL integration tests")
	}
	s, err := store.Open(context.Background(), url, fmt.Sprintf("test:%s:%d", t.Name(), time.Now().UnixNano()), 1)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx := context.Background()
		for _, table := range []string{"claims", "tickets", "draws", "events", "blocks", "deployments"} {
			_, _ = s.Pool.Exec(ctx, "DELETE FROM "+table+" WHERE identity=$1", s.Identity)
		}
		s.Close()
	})
	return s
}
func Header(n int64, parent common.Hash, branch string) *types.Header {
	return &types.Header{Number: big.NewInt(n), ParentHash: parent, Time: uint64(100 + n), Extra: []byte(branch), GasLimit: 30000000}
}
func Log(t *testing.T, h *types.Header, name string, id int64, logIndex uint, values ...any) types.Log {
	t.Helper()
	spec := lottery.ABI.Events[name]
	topics := []common.Hash{spec.ID, common.BigToHash(big.NewInt(id))}
	nonindexed := values
	if name == "TicketBought" || name == "PrizeClaimed" || name == "RefundClaimed" {
		topics = append(topics, common.BytesToHash(values[0].(common.Address).Bytes()))
		nonindexed = values[1:]
	}
	data, err := spec.Inputs.NonIndexed().Pack(nonindexed...)
	if err != nil {
		t.Fatal(err)
	}
	return types.Log{Address: Address, Topics: topics, Data: data, BlockNumber: h.Number.Uint64(), BlockHash: h.Hash(), TxHash: common.BigToHash(big.NewInt(1000 + int64(logIndex))), Index: logIndex}
}
func Start(t *testing.T, h *types.Header, id int64, index uint) types.Log {
	return Log(t, h, "DrawStarted", id, index, h.Time, h.Time+86400, big.NewInt(10), uint8(2), big.NewInt(0))
}
func Ticket(t *testing.T, h *types.Header, id int64, index uint) types.Log {
	return Log(t, h, "TicketBought", id, index, Buyer, uint8(1), big.NewInt(10), uint8(1), big.NewInt(10))
}
func Events(t *testing.T, h *types.Header, logs ...types.Log) []lottery.Event {
	t.Helper()
	var es []lottery.Event
	for _, l := range logs {
		e, err := lottery.Decode(l, h.Time)
		if err != nil {
			t.Fatal(err)
		}
		es = append(es, e)
	}
	return es
}
func Block(h *types.Header) store.Block {
	return store.Block{Number: h.Number.Int64(), Hash: h.Hash().Hex(), ParentHash: h.ParentHash.Hex(), Timestamp: h.Time}
}
