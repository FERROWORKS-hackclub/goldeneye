CREATE TABLE IF NOT EXISTS fw_marketing_lists (
 id uuid PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
 created_by text NOT NULL REFERENCES fw_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fw_marketing_contacts (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','subscribed','unsubscribed')),
 consent_source text NOT NULL DEFAULT '', consent_at timestamptz, confirmed_at timestamptz,
 confirmation_nonce uuid, confirmation_expires_at timestamptz, unsubscribed_at timestamptz,
 signup_metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fw_marketing_memberships (
 list_id uuid NOT NULL REFERENCES fw_marketing_lists(id) ON DELETE CASCADE,
 contact_id uuid NOT NULL REFERENCES fw_marketing_contacts(id) ON DELETE CASCADE,
 PRIMARY KEY(list_id,contact_id)
);
CREATE TABLE IF NOT EXISTS fw_marketing_suppressions (
 email text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fw_marketing_campaigns (
 id uuid PRIMARY KEY, name text NOT NULL, subject text NOT NULL DEFAULT '', preheader text NOT NULL DEFAULT '',
 blocks jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 0, field_versions jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','sending','sent','paused','needs_attention')),
 snapshot jsonb, audience jsonb, created_by text NOT NULL REFERENCES fw_users(id), updated_by text REFERENCES fw_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE TABLE IF NOT EXISTS fw_marketing_campaign_ops (
 campaign_id uuid NOT NULL REFERENCES fw_marketing_campaigns(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL, user_id text NOT NULL REFERENCES fw_users(id), revision integer NOT NULL,
 PRIMARY KEY(campaign_id,operation_id)
);
CREATE TABLE IF NOT EXISTS fw_marketing_presence (
 campaign_id uuid NOT NULL REFERENCES fw_marketing_campaigns(id) ON DELETE CASCADE,
 client_id uuid NOT NULL, user_id text NOT NULL REFERENCES fw_users(id), field text NOT NULL DEFAULT '',
 seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(campaign_id,client_id)
);
CREATE TABLE IF NOT EXISTS fw_marketing_deliveries (
 id uuid PRIMARY KEY, campaign_id uuid REFERENCES fw_marketing_campaigns(id),
 contact_id uuid NOT NULL REFERENCES fw_marketing_contacts(id), email text NOT NULL, name text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK(kind IN ('campaign','confirmation','test')),
 payload jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','processing','sent','failed','unknown','skipped')),
 attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 UNIQUE(campaign_id,email,kind)
);
CREATE INDEX IF NOT EXISTS fw_marketing_delivery_queue ON fw_marketing_deliveries(status,created_at);
CREATE TABLE IF NOT EXISTS fw_marketing_audit (
 id bigserial PRIMARY KEY, actor text, event text NOT NULL, target text NOT NULL DEFAULT '',
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fw_marketing_rate_limits (
 key text PRIMARY KEY, count integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS fw_research_responses (
 id uuid PRIMARY KEY, request_id uuid NOT NULL UNIQUE, survey_version text NOT NULL DEFAULT 'ferroworker-v1',
 name text NOT NULL, email text NOT NULL, answers jsonb NOT NULL, newsletter_consent boolean NOT NULL,
 browser_id uuid NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fw_research_response_date ON fw_research_responses(created_at DESC);
CREATE TABLE IF NOT EXISTS fw_marketing_settings (
 id integer PRIMARY KEY CHECK(id=1), settings jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO fw_marketing_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
