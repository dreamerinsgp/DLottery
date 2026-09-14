CREATE TABLE IF NOT EXISTS deployments (
 identity TEXT PRIMARY KEY, cursor BIGINT NOT NULL, cursor_hash TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS blocks (
 identity TEXT NOT NULL REFERENCES deployments(identity), number BIGINT NOT NULL, hash TEXT NOT NULL, parent_hash TEXT NOT NULL, timestamp BIGINT NOT NULL, PRIMARY KEY(identity,number)
);
CREATE TABLE IF NOT EXISTS events (
 identity TEXT NOT NULL REFERENCES deployments(identity), block_number BIGINT NOT NULL, block_hash TEXT NOT NULL, tx_hash TEXT NOT NULL, tx_index INTEGER NOT NULL, log_index INTEGER NOT NULL, body JSONB NOT NULL,
 PRIMARY KEY(identity,block_hash,tx_hash,log_index)
);
CREATE INDEX IF NOT EXISTS events_order ON events(identity,block_number,tx_index,log_index);
CREATE TABLE IF NOT EXISTS draws (
 identity TEXT NOT NULL REFERENCES deployments(identity), id NUMERIC(78,0) NOT NULL, status TEXT NOT NULL, pool NUMERIC(78,0) NOT NULL, body JSONB NOT NULL, PRIMARY KEY(identity,id)
);
CREATE TABLE IF NOT EXISTS tickets (
 identity TEXT NOT NULL, draw_id NUMERIC(78,0) NOT NULL, number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 10), wallet TEXT NOT NULL, refunded BOOLEAN NOT NULL,
 PRIMARY KEY(identity,draw_id,number), UNIQUE(identity,draw_id,wallet), FOREIGN KEY(identity,draw_id) REFERENCES draws(identity,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS claims (
 identity TEXT NOT NULL, draw_id NUMERIC(78,0) NOT NULL, wallet TEXT NOT NULL, kind TEXT NOT NULL, amount NUMERIC(78,0) NOT NULL, tx_hash TEXT NOT NULL,
 PRIMARY KEY(identity,draw_id,wallet,kind), FOREIGN KEY(identity,draw_id) REFERENCES draws(identity,id) ON DELETE CASCADE
);
