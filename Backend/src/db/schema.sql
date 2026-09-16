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
