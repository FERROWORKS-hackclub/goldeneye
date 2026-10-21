-- Customer-facing Goldeneye records stay separate from Ferrowork's internal workspace.
CREATE TABLE IF NOT EXISTS ge_saas_records (
  id uuid PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('projects','tasks','transactions','filament','jobs','quotes','orders','links')),
  data jsonb NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ge_saas_records_org_kind ON ge_saas_records(organization_id,kind,created_at DESC);
ALTER TABLE ge_saas_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ge_saas_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ge_saas_records_org_isolation ON ge_saas_records;
CREATE POLICY ge_saas_records_org_isolation ON ge_saas_records
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE TABLE IF NOT EXISTS ge_saas_subscriptions (
  organization_id text PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'starter' CHECK(plan IN ('starter','team','business')),
  status text NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','past_due','cancelled')),
  seat_limit integer NOT NULL DEFAULT 5 CHECK(seat_limit > 0),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
