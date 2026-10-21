import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {auth,configured} from './auth';
import {db} from './server';
import {defaultSettings,ferroModels} from './ferroai-models.mjs';
import {z} from 'zod';
import {isTrustedOrigin} from './trusted-origins.mjs';

export class FerroError extends Error{constructor(message:string,public status=400){super(message)}}
export async function ferroIdentity(){
 if(!configured)throw new FerroError('Ferrowork Identity setup is required.',503);
 const session=await auth().getSession();
 if(!session)throw new FerroError('Sign in to Ferrowork to use FerroAI.',401);
 const [user]=await db()`SELECT id,name,email,role,active FROM fw_users WHERE id=${session.user.sub}`;
 if(!user?.active)throw new FerroError('An active, approved Ferrowork account is required.',403);
 return user;
}
const limitSchema=z.object({enabled:z.boolean(),dailyRequests:z.number().int().min(1).max(100000),requestsPerMinute:z.number().int().min(1).max(1000),maxInputChars:z.number().int().min(100).max(64000),maxOutputTokens:z.number().int().min(64).max(8192)});
export const settingsSchema=z.object({enabled:z.boolean(),limits:limitSchema,roleLimits:z.record(z.string().max(200),limitSchema),userLimits:z.record(z.string().max(200),limitSchema),allowedModels:z.array(z.string().max(150)).min(1).max(ferroModels.length),allowedRoles:z.array(z.enum(['admin','manager','member','finance','viewer'])).max(5)});
export async function ferroSettings(){const [row]=await db()`SELECT config,key_cipher FROM fw_ai_settings WHERE id=1`;return {settings:settingsSchema.parse(row?.config||defaultSettings),cipher:row?.key_cipher as string|null};}
function secret(){const key=process.env.AUTH0_SECRET||process.env.BETTER_AUTH_SECRET;if(!key)throw new FerroError('Server encryption is not configured.',503);return createHash('sha256').update('ferroai-key:'+key).digest()}
export function encryptKey(value:string){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),nonce);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),data]).toString('base64')}
export function providerKey(cipher:string|null){if(cipher){const data=Buffer.from(cipher,'base64'),decipher=createDecipheriv('aes-256-gcm',secret(),data.subarray(0,12));decipher.setAuthTag(data.subarray(12,28));return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8')}return process.env.HC_AI_API_KEY||''}
export async function countsFor(id:string){const [row]=await db()`SELECT count(*) FILTER (WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS daily,count(*) FILTER (WHERE created_at>now()-interval '1 minute')::int AS minute FROM fw_ai_requests WHERE user_id=${id} AND created_at>now()-interval '1 day'`;return row}
export function ferroFailure(error:unknown,extra:Record<string,unknown>={}){const invalid=error instanceof z.ZodError||error instanceof SyntaxError,status=error instanceof FerroError?error.status:invalid?400:503;return Response.json({error:error instanceof FerroError?error.message:invalid?'Invalid FerroAI request. Check your settings and input.':'FerroAI is temporarily unavailable. Please try again.',...extra},{status,headers:{'Cache-Control':'no-store'}})}
export function checkOrigin(request:Request){if(!isTrustedOrigin(request.headers.get('origin')))throw new FerroError('Invalid request origin.',403)}
