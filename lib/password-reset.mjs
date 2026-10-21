export async function activePasswordResetToken(params, findVerification, now = new Date()) {
  const token = params.token;
  if (params.error || typeof token !== 'string' || !token || token.length > 256) return undefined;
  const verification = await findVerification(`reset-password:${token}`);
  return verification && new Date(verification.expiresAt) > now ? token : undefined;
}
