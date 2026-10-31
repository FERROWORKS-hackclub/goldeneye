CREATE TABLE IF NOT EXISTS fw_sign_documents (
 id uuid PRIMARY KEY, title text NOT NULL, source_blob text NOT NULL, created_by text NOT NULL REFERENCES fw_users(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','completed','void')),
 fields jsonb NOT NULL DEFAULT '[]'::jsonb, completed_blob text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
ALTER TABLE fw_sign_documents ADD COLUMN IF NOT EXISTS completed_blob text;
CREATE TABLE IF NOT EXISTS fw_sign_recipients (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES fw_sign_documents(id) ON DELETE CASCADE,
 user_id text REFERENCES fw_users(id), email text NOT NULL, name text NOT NULL, signer_order integer NOT NULL DEFAULT 1,
 token_hash text UNIQUE, token_expires_at timestamptz, signed_at timestamptz, answers jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fw_sign_recipient_user ON fw_sign_recipients(user_id, signed_at);
CREATE INDEX IF NOT EXISTS fw_sign_recipient_document ON fw_sign_recipients(document_id);
CREATE TABLE IF NOT EXISTS fw_sign_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, document_id uuid NOT NULL REFERENCES fw_sign_documents(id) ON DELETE CASCADE,
 recipient_id uuid REFERENCES fw_sign_recipients(id) ON DELETE SET NULL, actor text NOT NULL, event text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
