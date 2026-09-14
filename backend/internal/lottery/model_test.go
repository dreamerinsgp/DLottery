package lottery_test

import (
	"dlottery/backend/internal/lottery"
	"dlottery/backend/internal/testutil"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"math/big"
	"testing"
)

func TestDecodeAndProject(t *testing.T) {
	h := testutil.Header(1, common.Hash{}, "a")
	events := testutil.Events(t, h, testutil.Start(t, h, 1, 0), testutil.Ticket(t, h, 1, 1))
	var d *lottery.Draw
	var err error
	for _, e := range events {
		d, err = lottery.Apply(d, e)
		if err != nil {
			t.Fatal(err)
		}
	}
	if d.ParticipantCount != 1 || d.Pool != "10" || len(d.Tickets) != 10 || d.StartTime != 101 {
		t.Fatalf("wrong projection: %+v", d)
	}
	d.Refresh(d.Deadline - 1)
	if d.CanPerformDraw || d.RemainingSeconds != 1 {
		t.Fatal("early eligibility")
	}
	d.Refresh(d.Deadline)
	if !d.CanPerformDraw || d.RemainingSeconds != 0 {
		t.Fatal("deadline eligibility")
	}
	if _, err = lottery.Apply(d, events[1]); err == nil {
		t.Fatal("duplicate mutation accepted")
	}
}
func TestEveryRequiredEvent(t *testing.T) {
	h := testutil.Header(1, common.Hash{}, "a")
	logs := []types.Log{testutil.Start(t, h, 1, 0), testutil.Ticket(t, h, 1, 1), testutil.Log(t, h, "RandomnessRequested", 1, 2, big.NewInt(55)), testutil.Log(t, h, "LotteryDrawn", 1, 3, uint8(1), testutil.Buyer, big.NewInt(10), big.NewInt(0), big.NewInt(10), big.NewInt(0)), testutil.Log(t, h, "PrizeClaimed", 1, 4, testutil.Buyer, big.NewInt(10), common.Address{}, big.NewInt(0))}
	var d *lottery.Draw
	for _, e := range testutil.Events(t, h, logs...) {
		var err error
		d, err = lottery.Apply(d, e)
		if err != nil {
			t.Fatal(err)
		}
	}
	if !d.PrizeClaimed || d.Status != "COMPLETED" {
		t.Fatal("prize not reflected")
	}
	logs = []types.Log{testutil.Start(t, h, 2, 5), testutil.Ticket(t, h, 2, 6), testutil.Log(t, h, "DrawCancelled", 2, 7, uint8(1), big.NewInt(10), big.NewInt(0)), testutil.Log(t, h, "RefundClaimed", 2, 8, testutil.Buyer, big.NewInt(10))}
	d = nil
	for _, e := range testutil.Events(t, h, logs...) {
		var err error
		d, err = lottery.Apply(d, e)
		if err != nil {
			t.Fatal(err)
		}
	}
	if !d.Tickets[0].Refunded || d.Status != "CANCELLED" {
		t.Fatal("refund not reflected")
	}
}
func TestMalformedLogStopsDecoding(t *testing.T) {
	for _, l := range []types.Log{{}, {Topics: []common.Hash{{1}}}} {
		if _, err := lottery.Decode(l, 1); err == nil {
			t.Fatal("malformed log accepted")
		}
	}
}
