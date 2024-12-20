-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, -- Hashed password
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create nodes table
CREATE TABLE IF NOT EXISTS nodes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,      -- 'user' or 'assistant'
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create edges table
CREATE TABLE IF NOT EXISTS edges (
  parent_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, child_id)
);

-- Index for faster lookup by user_id
CREATE INDEX IF NOT EXISTS idx_nodes_user_id ON nodes(user_id);