import { z } from 'zod';

export const staffRole = role => role === 'admin' || role === 'manager';
export function sameOriginRequest(origin, requestUrl) {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(requestUrl).origin; } catch { return false; }
}
export const usableSigningLink = (row, now = new Date()) => Boolean(row && row.token_expires_at && Number.isFinite(new Date(row.token_expires_at).getTime()) && new Date(row.token_expires_at) > now);
const field = z.object({
  id: z.string().uuid(), type: z.enum(['signature','date','number','sentence','word']),
  label: z.string().trim().max(120), page: z.number().int().min(0),
  recipientIndex: z.number().int().min(0), required: z.boolean(),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
});
export const envelopeSchema = z.object({
  title: z.string().trim().min(1).max(160),
  fields: z.array(field).min(1).max(100),
  recipients: z.array(z.object({name:z.string().trim().min(1).max(120),email:z.email().trim().toLowerCase().max(254)})).min(1).max(20),
}).superRefine((value, ctx) => {
  if (new Set(value.fields.map(f => f.id)).size !== value.fields.length) ctx.addIssue({code:'custom',message:'Field IDs must be unique.'});
  for (const f of value.fields) {
    if (f.recipientIndex >= value.recipients.length || f.x + f.width > 1 || f.y + f.height > 1) ctx.addIssue({code:'custom',message:'Invalid field placement or signer.'});
  }
  value.recipients.forEach((_,i) => {
    if (!value.fields.some(f => f.recipientIndex === i && f.type === 'signature' && f.required)) ctx.addIssue({code:'custom',message:'Place a required signature field for every signer.'});
  });
});

export function validateAnswers(fields, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {error:'Complete the required fields.'};
  const answers = {};
  if (Object.keys(input).some(key => !fields.some(f => f.id === key))) return {error:'Unknown field.'};
  for (const f of fields) {
    const value = input[f.id];
    if (value === undefined || value === '') {
      if (f.required) return {error:`Complete the ${f.label || f.type} field.`};
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) return {error:'Invalid field value.'};
    if (f.type === 'signature') {
      if (value.length > 1400000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return {error:'Signature must be a drawn PNG under 1 MB.'};
      const png = Buffer.from(value.split(',')[1], 'base64');
      if (png.length < 24 || png.length > 1024 * 1024 || png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) > 4096 || png.readUInt32BE(20) > 4096) return {error:'Invalid signature image.'};
    } else {
      if (value.length > (f.type === 'word' ? 80 : 500) || /[^\x20-\x7e\xa0-\xff]/.test(value)) return {error:'Use supported Latin text within the field limit.'};
      if (f.type === 'word' && /\s/.test(value.trim())) return {error:'Enter a single word.'};
      if (f.type === 'number' && !/^-?\d+(?:\.\d+)?$/.test(value)) return {error:'Enter a valid number.'};
      if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) return {error:'Enter a valid date.'};
    }
    answers[f.id] = value;
  }
  return {answers};
}
