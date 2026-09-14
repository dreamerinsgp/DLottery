package store

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"dlottery/backend/internal/lottery"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schema string

type Store struct {
	Pool     *pgxpool.Pool
	Identity string
	Start    int64
	lock     *pgxpool.Conn
}
type Block struct {
	Number     int64
	Hash       string
	ParentHash string
	Timestamp  uint64
}

func Open(ctx context.Context, url, identity string, start int64) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	s := &Store{Pool: pool, Identity: identity, Start: start}
	migration, err := pool.Begin(ctx)
	if err != nil {
		pool.Close()
		return nil, err
	}
	if _, err = migration.Exec(ctx, "SELECT pg_advisory_xact_lock(183742991)"); err == nil {
		_, err = migration.Exec(ctx, schema)
	}
	if err != nil {
		_ = migration.Rollback(ctx)
		pool.Close()
		return nil, err
	}
	if err = migration.Commit(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	_, err = pool.Exec(ctx, "INSERT INTO deployments(identity,cursor) VALUES($1,$2) ON CONFLICT DO NOTHING", identity, start-1)
	if err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}
func (s *Store) Close() {
	if s.lock != nil {
		_, _ = s.lock.Exec(context.Background(), "SELECT pg_advisory_unlock(hashtextextended($1,0))", s.Identity)
		s.lock.Release()
	}
	s.Pool.Close()
}
func (s *Store) Lock(ctx context.Context) error {
	c, err := s.Pool.Acquire(ctx)
	if err != nil {
		return err
	}
	var ok bool
	err = c.QueryRow(ctx, "SELECT pg_try_advisory_lock(hashtextextended($1,0))", s.Identity).Scan(&ok)
	if err != nil || !ok {
		c.Release()
		return fmt.Errorf("indexer lock unavailable: %v", err)
	}
	s.lock = c
	return nil
}
func (s *Store) Cursor(ctx context.Context) (int64, string, error) {
	var n int64
	var hash string
	err := s.Pool.QueryRow(ctx, "SELECT cursor,cursor_hash FROM deployments WHERE identity=$1", s.Identity).Scan(&n, &hash)
	return n, hash, err
}
func (s *Store) Block(ctx context.Context, n int64) (Block, error) {
	var b Block
	err := s.Pool.QueryRow(ctx, "SELECT number,hash,parent_hash,timestamp FROM blocks WHERE identity=$1 AND number=$2", s.Identity, n).Scan(&b.Number, &b.Hash, &b.ParentHash, &b.Timestamp)
	return b, err
}
func readDraw(ctx context.Context, tx pgx.Tx, identity, id string) (*lottery.Draw, error) {
	var body []byte
	err := tx.QueryRow(ctx, "SELECT body FROM draws WHERE identity=$1 AND id=$2", identity, id).Scan(&body)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var d lottery.Draw
	err = json.Unmarshal(body, &d)
	return &d, err
}
func project(ctx context.Context, tx pgx.Tx, identity string, e lottery.Event) error {
	d, err := readDraw(ctx, tx, identity, e.Values["drawId"])
	if err != nil {
		return err
	}
	d, err = lottery.Apply(d, e)
	if err != nil {
		return err
	}
	body, err := json.Marshal(d)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO draws(identity,id,status,pool,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(identity,id) DO UPDATE SET status=excluded.status,pool=excluded.pool,body=excluded.body", identity, d.ID, d.Status, d.Pool, body)
	if err != nil {
		return err
	}
	for _, t := range d.Tickets {
		if t.Wallet != nil {
			_, err = tx.Exec(ctx, "INSERT INTO tickets(identity,draw_id,number,wallet,refunded) VALUES($1,$2,$3,$4,$5) ON CONFLICT(identity,draw_id,number) DO UPDATE SET refunded=excluded.refunded", identity, d.ID, t.Number, *t.Wallet, t.Refunded)
			if err != nil {
				return err
			}
		}
	}
	if e.Name == "PrizeClaimed" || e.Name == "RefundClaimed" {
		wallet := e.Values["winner"]
		if e.Name == "RefundClaimed" {
			wallet = e.Values["participant"]
		}
		_, err = tx.Exec(ctx, "INSERT INTO claims(identity,draw_id,wallet,kind,amount,tx_hash) VALUES($1,$2,$3,$4,$5,$6)", identity, d.ID, wallet, e.Name, e.Values["amount"], e.TxHash)
	}
	return err
}

// CommitBlock makes the entire block, its projections, and the cursor indivisible.
func (s *Store) CommitBlock(ctx context.Context, b Block, events []lottery.Event) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var cursor int64
	var hash string
	if err = tx.QueryRow(ctx, "SELECT cursor,cursor_hash FROM deployments WHERE identity=$1 FOR UPDATE", s.Identity).Scan(&cursor, &hash); err != nil {
		return err
	}
	if b.Number <= cursor {
		stored, err := s.Block(ctx, b.Number)
		if err != nil {
			return err
		}
		if stored.Hash != b.Hash {
			return fmt.Errorf("conflicting replay")
		}
		return nil
	}
	if b.Number != cursor+1 || (hash != "" && hash != b.ParentHash) {
		return fmt.Errorf("noncontiguous block %d after %d", b.Number, cursor)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO blocks(identity,number,hash,parent_hash,timestamp) VALUES($1,$2,$3,$4,$5)", s.Identity, b.Number, b.Hash, b.ParentHash, b.Timestamp); err != nil {
		return err
	}
	for _, e := range events {
		if e.BlockNumber != uint64(b.Number) || e.BlockHash != b.Hash {
			return fmt.Errorf("event/header mismatch")
		}
		body, _ := json.Marshal(e)
		tag, err := tx.Exec(ctx, "INSERT INTO events(identity,block_number,block_hash,tx_hash,tx_index,log_index,body) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", s.Identity, b.Number, b.Hash, e.TxHash, e.TxIndex, e.LogIndex, body)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 1 {
			if err = project(ctx, tx, s.Identity, e); err != nil {
				return err
			}
		}
	}
	_, err = tx.Exec(ctx, "UPDATE deployments SET cursor=$2,cursor_hash=$3,updated_at=now() WHERE identity=$1", s.Identity, b.Number, b.Hash)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Rewind rebuilds only from retained canonical events, all inside one transaction.
func (s *Store) Rewind(ctx context.Context, ancestor int64) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT 1 FROM deployments WHERE identity=$1 FOR UPDATE", s.Identity); err != nil {
		return err
	}
	for _, q := range []string{"DELETE FROM events WHERE identity=$1 AND block_number>$2", "DELETE FROM blocks WHERE identity=$1 AND number>$2"} {
		if _, err = tx.Exec(ctx, q, s.Identity, ancestor); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(ctx, "DELETE FROM draws WHERE identity=$1", s.Identity); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, "SELECT body FROM events WHERE identity=$1 ORDER BY block_number,tx_index,log_index", s.Identity)
	if err != nil {
		return err
	}
	var events []lottery.Event
	for rows.Next() {
		var body []byte
		var e lottery.Event
		if err = rows.Scan(&body); err != nil {
			rows.Close()
			return err
		}
		if err = json.Unmarshal(body, &e); err != nil {
			rows.Close()
			return err
		}
		events = append(events, e)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	for _, e := range events {
		if err = project(ctx, tx, s.Identity, e); err != nil {
			return err
		}
	}
	hash := ""
	if ancestor >= s.Start {
		if err = tx.QueryRow(ctx, "SELECT hash FROM blocks WHERE identity=$1 AND number=$2", s.Identity, ancestor).Scan(&hash); err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, "UPDATE deployments SET cursor=$2,cursor_hash=$3,updated_at=now() WHERE identity=$1", s.Identity, ancestor, hash)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type Snapshot struct {
	Cursor     int64
	Hash       string
	ChainTime  uint64
	Draws      []*lottery.Draw
	NextCursor *string
}

func (s *Store) Read(ctx context.Context, mode, id, cursor string, limit int) (Snapshot, error) {
	var out Snapshot
	out.Draws = []*lottery.Draw{}
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, "SELECT cursor,cursor_hash FROM deployments WHERE identity=$1", s.Identity).Scan(&out.Cursor, &out.Hash)
	if err != nil {
		return out, err
	}
	if out.Cursor >= s.Start {
		if err = tx.QueryRow(ctx, "SELECT timestamp FROM blocks WHERE identity=$1 AND number=$2", s.Identity, out.Cursor).Scan(&out.ChainTime); err != nil {
			return out, err
		}
	}
	q := "SELECT body FROM draws WHERE identity=$1"
	args := []any{s.Identity}
	switch mode {
	case "detail":
		q += " AND id=$2"
		args = append(args, id)
	case "history":
		q += " AND status NOT IN ('ACTIVE','DRAWING')"
		if cursor != "" {
			q += " AND id<$2"
			args = append(args, cursor)
		}
	}
	q += " ORDER BY id DESC LIMIT " + strconv.Itoa(limit+1)
	if mode != "history" {
		q = q[:stringsLastLimit(q)] + " LIMIT 1"
	}
	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var body []byte
		var d lottery.Draw
		if err = rows.Scan(&body); err != nil {
			rows.Close()
			return out, err
		}
		if err = json.Unmarshal(body, &d); err != nil {
			rows.Close()
			return out, err
		}
		d.Refresh(out.ChainTime)
		out.Draws = append(out.Draws, &d)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	if len(out.Draws) > limit {
		out.Draws = out.Draws[:limit]
		next := out.Draws[limit-1].ID
		out.NextCursor = &next
	}
	return out, tx.Commit(ctx)
}
func stringsLastLimit(s string) int {
	for i := len(s) - 7; i >= 0; i-- {
		if s[i:i+7] == " LIMIT " {
			return i
		}
	}
	return len(s)
}

// A dead advisory-lock connection is fatal to this writer until restart.
func (s *Store) CheckLock(ctx context.Context) error {
	if s.lock == nil {
		return fmt.Errorf("writer lock not held")
	}
	return s.lock.Ping(ctx)
}
