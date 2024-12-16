CREATE TABLE IF NOT EXISTS nodes (
  id SERIAL PRIMARY KEY,
  user_id TEXT,           -- for multi-user support later, for now can be nullable
  role TEXT NOT NULL,      -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edges (
  parent_id INTEGER NOT NULL REFERENCES nodes(id),
  child_id INTEGER NOT NULL REFERENCES nodes(id),
  PRIMARY KEY (parent_id, child_id)
);
