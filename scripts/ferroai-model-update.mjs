import postgres from 'postgres';
import {addedModelIds} from '../lib/ferroai-models.mjs';
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false});
try{
 await sql.begin(async transaction=>{
  const [row]=await transaction`SELECT config FROM fw_ai_settings WHERE id=1 FOR UPDATE`;
  if(!row)throw Error('Run FerroAI database setup first.');
  const [marker]=await transaction`SELECT id FROM fw_audit WHERE action='ferroai.models.live.v1' LIMIT 1`;
  if(!marker){const config={...row.config,allowedModels:[...new Set([...row.config.allowedModels,...addedModelIds])]};await transaction`UPDATE fw_ai_settings SET config=${transaction.json(config)},updated_at=now() WHERE id=1`;await transaction`INSERT INTO fw_audit(actor,action,target) VALUES ('system','ferroai.models.live.v1','ferroai')`;}
 });
 console.log('Advanced and live models enabled; existing role, quota and original-model settings preserved.');
}finally{await sql.end()}
