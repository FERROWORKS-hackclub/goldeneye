import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'verify-full', max: 1, prepare: false });
try {
  const keys = await sql`SELECT id, "createdAt", "expiresAt", alg FROM jwks ORDER BY "createdAt"`;
  console.log(JSON.stringify(keys));
  const keyId = process.argv[2];
  if (keyId) {
    const retired = await sql`UPDATE jwks SET "expiresAt"=now()-interval '1 second' WHERE id=${keyId} AND ("expiresAt" IS NULL OR "expiresAt">now()) RETURNING id`;
    console.log(JSON.stringify({ retired: retired.length, publicKeyPreserved: true }));
  }
} finally {
  await sql.end();
}
