-- Run this once in the Neon SQL Editor (or via psql) to create the users table.
-- Neon dashboard -> SQL Editor -> paste this whole file -> Run.

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           VARCHAR(20) NOT NULL
                 CHECK (role IN ('Super Admin', 'Manager', 'Editor', 'User')),
  employee_id    VARCHAR(20),
  department     VARCHAR(100),
  status         VARCHAR(20) NOT NULL DEFAULT 'Active'
                 CHECK (status IN ('Active', 'Disabled')),
  -- true right after a Super Admin creates the account with a temp password;
  -- flipped to false once the user sets their own password (ties into
  -- ChangePassword.jsx / the forced-first-login flow).
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Speeds up the most common lookup: finding a user by email at login time.
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Stores file and folder permissions. A folder share uses a file_key ending in '/'.
CREATE TABLE IF NOT EXISTS shares (
  id             SERIAL PRIMARY KEY,
  file_key       TEXT NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission     VARCHAR(20) NOT NULL
                 CHECK (permission IN ('Read Only', 'Read & Write')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shares_file_recipient_unique UNIQUE (file_key, shared_with_id)
);

CREATE INDEX IF NOT EXISTS idx_shares_shared_with ON shares(shared_with_id);
CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_file_key ON shares(file_key);

-- Access requests sent from a file link by users who don't have access yet.
-- (Also created automatically at backend start by files/access-requests.routes.js.)
CREATE TABLE IF NOT EXISTS access_requests (
  id           SERIAL PRIMARY KEY,
  file_key     TEXT NOT NULL,
  file_name    VARCHAR(255) NOT NULL,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission   VARCHAR(20) NOT NULL CHECK (permission IN ('Read Only', 'Read & Write')),
  message      TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'denied')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_access_requests_pending
  ON access_requests (file_key, requester_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_access_requests_owner ON access_requests (owner_id, status);
