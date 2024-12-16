CREATE TABLE IF NOT EXISTS nodes (
  id SERIAL PRIMARY KEY,
  user_id TEXT,           -- for multi-user support later, for now can be nullable
  role TEXT NOT NULL,      -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
