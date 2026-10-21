import postgres from 'postgres';
let client: ReturnType<typeof postgres>;
export function db() { if(!process.env.DATABASE_URL) throw new Error('Database setup required'); return client ??= postgres(process.env.DATABASE_URL,{ssl: ['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname) ? false : 'require',max:3,prepare:false}); }

