package lottery

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

//go:embed abi.json
var ABIJSON string
var ABI = mustABI()

func mustABI() abi.ABI {
	a, err := abi.JSON(strings.NewReader(ABIJSON))
	if err != nil {
		panic(err)
	}
	return a
}

type Event struct {
	Name        string            `json:"name"`
	Values      map[string]string `json:"values"`
	BlockNumber uint64            `json:"blockNumber"`
	BlockHash   string            `json:"blockHash"`
	TxHash      string            `json:"transactionHash"`
	TxIndex     uint              `json:"transactionIndex"`
	LogIndex    uint              `json:"logIndex"`
	Timestamp   uint64            `json:"timestamp"`
}

func Decode(log types.Log, timestamp uint64) (Event, error) {
	if len(log.Topics) == 0 {
		return Event{}, fmt.Errorf("log missing event signature")
	}
	spec, err := ABI.EventByID(log.Topics[0])
	if err != nil {
		return Event{}, fmt.Errorf("unknown event %s", log.Topics[0])
	}
	values := map[string]interface{}{}
	if err = spec.Inputs.NonIndexed().UnpackIntoMap(values, log.Data); err != nil {
		return Event{}, err
	}
	var indexed abi.Arguments
	for _, input := range spec.Inputs {
		if input.Indexed {
			indexed = append(indexed, input)
		}
	}
	if err = abi.ParseTopicsIntoMap(values, indexed, log.Topics[1:]); err != nil {
		return Event{}, err
	}
	out := Event{Name: spec.Name, Values: map[string]string{}, BlockNumber: log.BlockNumber, BlockHash: log.BlockHash.Hex(), TxHash: log.TxHash.Hex(), TxIndex: log.TxIndex, LogIndex: log.Index, Timestamp: timestamp}
	for k, v := range values {
		if a, ok := v.(common.Address); ok {
			out.Values[k] = strings.ToLower(a.Hex())
		} else {
			out.Values[k] = fmt.Sprint(v)
		}
	}
	return out, nil
}

type Ticket struct {
	Number   int     `json:"number"`
	Wallet   *string `json:"wallet"`
	Refunded bool    `json:"refunded"`
}
type Draw struct {
	ID                  string   `json:"id"`
	Status              string   `json:"status"`
	StartTime           uint64   `json:"startTime"`
	Deadline            uint64   `json:"deadline"`
	FinalizedAt         *uint64  `json:"finalizedAt"`
	TicketPrice         string   `json:"ticketPrice"`
	MinimumParticipants int      `json:"minimumParticipants"`
	ParticipantCount    int      `json:"participantCount"`
	LuckyNumber         *int     `json:"luckyNumber"`
	Winner              *string  `json:"winner"`
	Pool                string   `json:"pool"`
	InheritedRollover   string   `json:"inheritedRollover"`
	Rollover            string   `json:"rollover"`
	DAOFee              string   `json:"daoFee"`
	WinnerPrize         string   `json:"winnerPrize"`
	PrizeClaimed        bool     `json:"prizeClaimed"`
	DAOFeePaid          string   `json:"daoFeePaid"`
	RequestID           *string  `json:"requestId"`
	Tickets             []Ticket `json:"tickets"`
	RemainingSeconds    uint64   `json:"remainingSeconds"`
	CanPerformDraw      bool     `json:"canPerformDraw"`
}

func (d *Draw) Refresh(now uint64) {
	d.RemainingSeconds = 0
	if d.Status == "ACTIVE" && now < d.Deadline {
		d.RemainingSeconds = d.Deadline - now
	}
	d.CanPerformDraw = d.Status == "ACTIVE" && (d.ParticipantCount == 5 || now >= d.Deadline)
}
func number(s string) (uint64, error) {
	n, ok := new(big.Int).SetString(s, 10)
	if !ok || !n.IsUint64() {
		return 0, fmt.Errorf("invalid integer %q", s)
	}
	return n.Uint64(), nil
}
func Apply(d *Draw, e Event) (*Draw, error) {
	v := e.Values
	id := v["drawId"]
	if _, ok := new(big.Int).SetString(id, 10); !ok {
		return nil, fmt.Errorf("missing drawId")
	}
	if e.Name == "DrawStarted" {
		if d != nil {
			return nil, fmt.Errorf("duplicate draw start")
		}
		start, err := number(v["startTime"])
		if err != nil {
			return nil, err
		}
		deadline, err := number(v["deadline"])
		if err != nil {
			return nil, err
		}
		min, err := number(v["minimumParticipants"])
		if err != nil {
			return nil, err
		}
		d = &Draw{ID: id, Status: "ACTIVE", StartTime: start, Deadline: deadline, TicketPrice: v["ticketPrice"], MinimumParticipants: int(min), InheritedRollover: v["inheritedRollover"], Pool: v["inheritedRollover"], Rollover: "0", DAOFee: "0", WinnerPrize: "0", DAOFeePaid: "0", Tickets: make([]Ticket, 10)}
		for i := range d.Tickets {
			d.Tickets[i].Number = i + 1
		}
		return d, nil
	}
	if d == nil || d.ID != id {
		return nil, fmt.Errorf("event %s precedes draw %s", e.Name, id)
	}
	switch e.Name {
	case "TicketBought":
		n, err := number(v["ticketNumber"])
		if err != nil || n < 1 || n > 10 {
			return nil, fmt.Errorf("invalid ticket number")
		}
		count, err := number(v["participantCount"])
		if err != nil {
			return nil, err
		}
		if d.Status != "ACTIVE" || d.Tickets[n-1].Wallet != nil || int(count) != d.ParticipantCount+1 {
			return nil, fmt.Errorf("invalid ticket transition")
		}
		buyer := v["buyer"]
		for _, t := range d.Tickets {
			if t.Wallet != nil && *t.Wallet == buyer {
				return nil, fmt.Errorf("duplicate wallet")
			}
		}
		d.Tickets[n-1].Wallet = &buyer
		d.ParticipantCount = int(count)
		d.Pool = v["pool"]
	case "RandomnessRequested":
		if d.Status != "ACTIVE" {
			return nil, fmt.Errorf("invalid randomness transition")
		}
		d.Status = "DRAWING"
		req := v["requestId"]
		d.RequestID = &req
	case "LotteryDrawn":
		if d.Status != "DRAWING" {
			return nil, fmt.Errorf("invalid settlement transition")
		}
		n, err := number(v["luckyNumber"])
		if err != nil || n < 1 || n > 10 {
			return nil, fmt.Errorf("invalid lucky number")
		}
		lucky := int(n)
		d.LuckyNumber = &lucky
		d.Pool = v["pool"]
		d.DAOFee = v["daoFee"]
		d.WinnerPrize = v["winnerPrize"]
		d.Rollover = v["rollover"]
		ts := e.Timestamp
		d.FinalizedAt = &ts
		if v["winner"] == strings.ToLower(common.Address{}.Hex()) {
			d.Status = "NO_WINNER"
		} else {
			d.Status = "WINNER_DECLARED"
			winner := v["winner"]
			d.Winner = &winner
		}
	case "DrawCancelled":
		if d.Status != "ACTIVE" {
			return nil, fmt.Errorf("invalid cancellation transition")
		}
		d.Status = "CANCELLED"
		d.Rollover = v["rollover"]
		ts := e.Timestamp
		d.FinalizedAt = &ts
	case "PrizeClaimed":
		if d.Status != "WINNER_DECLARED" || d.Winner == nil || *d.Winner != v["winner"] || d.WinnerPrize != v["amount"] || d.DAOFee != v["daoFee"] {
			return nil, fmt.Errorf("invalid prize claim")
		}
		d.Status = "COMPLETED"
		d.PrizeClaimed = true
		d.DAOFeePaid = v["daoFee"]
	case "RefundClaimed":
		if d.Status != "CANCELLED" || v["amount"] != d.TicketPrice {
			return nil, fmt.Errorf("invalid refund")
		}
		found := false
		for i, t := range d.Tickets {
			if t.Wallet != nil && *t.Wallet == v["participant"] && !t.Refunded {
				d.Tickets[i].Refunded = true
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("unknown or duplicate refund")
		}
	default:
		return nil, fmt.Errorf("unsupported event %s", e.Name)
	}
	return d, nil
}
func Clone(d *Draw) *Draw {
	if d == nil {
		return nil
	}
	b, _ := json.Marshal(d)
	var out Draw
	_ = json.Unmarshal(b, &out)
	return &out
}
