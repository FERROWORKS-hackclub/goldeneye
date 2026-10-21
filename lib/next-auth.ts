import NextAuth from 'next-auth';

const authHost = process.env.BETTER_AUTH_URL || 'https://auth.ferroworks.org';
const clientId = process.env.FERROWORK_OIDC_CLIENT_ID || 'not-configured';
const clientSecret = process.env.FERROWORK_OIDC_CLIENT_SECRET || 'not-configured';

export const { handlers, auth: webSession, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET || process.env.BETTER_AUTH_SECRET,
  providers: [{
    id: 'ferrowork', name: 'Ferrowork', type: 'oidc', issuer: `${authHost}/api/auth`,
    clientId, clientSecret, checks: ['pkce', 'state'],
    authorization: { params: { scope: 'openid profile email offline_access' } },
  }],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile?.sub) token.sub = profile.sub;
      if (profile?.email) token.email = profile.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || '';
      }
      return session;
    },
  },
});
