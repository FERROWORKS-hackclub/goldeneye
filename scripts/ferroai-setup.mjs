import postgres from 'postgres';
import {defaultSettings} from '../lib/ferroai-models.mjs';
if(!process.env.DATABASE_URL)throw Error('Set DATABASE_URL');
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false});
try{
 await sql`CREATE TABLE IF NOT EXISTS fw_ai_settings(id integer PRIMARY KEY CHECK(id=1),config jsonb NOT NULL,key_cipher text,updated_at timestamptz NOT NULL DEFAULT now())`;
 await sql`CREATE TABLE IF NOT EXISTS fw_ai_requests(id uuid PRIMARY KEY,user_id text NOT NULL REFERENCES fw_users(id),model text NOT NULL,status text NOT NULL CHECK(status IN ('pending','complete','failed')),tokens integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now())`;
 await sql`CREATE INDEX IF NOT EXISTS fw_ai_requests_user_time ON fw_ai_requests(user_id,created_at)`;
 await sql`INSERT INTO fw_ai_settings(id,config) VALUES (1,${sql.json(defaultSettings)}) ON CONFLICT(id) DO NOTHING`;
 await sql`CREATE TABLE IF NOT EXISTS fw_ai_chats(id uuid PRIMARY KEY,user_id text NOT NULL REFERENCES fw_users(id),title text NOT NULL,model text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;
 await sql`CREATE INDEX IF NOT EXISTS fw_ai_chats_user_time ON fw_ai_chats(user_id,updated_at DESC)`;
 await sql`ALTER TABLE fw_ai_requests ADD COLUMN IF NOT EXISTS chat_id uuid REFERENCES fw_ai_chats(id) ON DELETE SET NULL`;
 await sql`CREATE TABLE IF NOT EXISTS fw_ai_messages(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,chat_id uuid NOT NULL REFERENCES fw_ai_chats(id) ON DELETE CASCADE,role text NOT NULL CHECK(role IN ('user','assistant')),content text NOT NULL,model text NOT NULL,embedding jsonb,failed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now())`;
 await sql`CREATE INDEX IF NOT EXISTS fw_ai_messages_chat ON fw_ai_messages(chat_id,id)`;
 await sql`ALTER TABLE fw_ai_messages ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb`;
 console.log('FerroAI database ready.');
}finally{await sql.end()}
