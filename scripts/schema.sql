CREATE TABLE IF NOT EXISTS fw_users (id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, role text NOT NULL CHECK(role IN ('admin','manager','member','finance','viewer')), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fw_records (id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('projects','tasks','transactions','links')), data jsonb NOT NULL, created_by text NOT NULL REFERENCES fw_users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS fw_records_kind ON fw_records(kind);
CREATE TABLE IF NOT EXISTS fw_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE fw_records DROP CONSTRAINT IF EXISTS fw_records_kind_check;
ALTER TABLE fw_records ADD CONSTRAINT fw_records_kind_check CHECK (kind IN ('projects','tasks','transactions','links','filament','jobs','quotes','orders','allocations','bom','changes','firmware','test_runs','issues'));

ALTER TABLE fw_users ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE fw_users ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE fw_users ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS fw_invitations (
 id uuid PRIMARY KEY,
 token_hash text UNIQUE NOT NULL,
 email text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','manager','member','finance','viewer')),
 created_by text NOT NULL REFERENCES fw_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS fw_invitations_email ON fw_invitations(email);
CREATE TABLE IF NOT EXISTS fw_signup_links (
 id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, created_by text NOT NULL REFERENCES fw_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS fw_join_requests (
 id uuid PRIMARY KEY, user_id text UNIQUE NOT NULL REFERENCES fw_users(id), link_id uuid NOT NULL REFERENCES fw_signup_links(id),
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Denied')),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by text REFERENCES fw_users(id)
);
CREATE TABLE IF NOT EXISTS fw_signup_attempts (fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS fw_signup_attempts_fingerprint ON fw_signup_attempts(fingerprint,created_at);
