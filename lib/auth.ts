import { headers } from 'next/headers';
import { identityAuth } from './better-auth';
import { webSession } from './next-auth';
import { db } from './server';

export const identityConfigured = !!(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL);
export const configured = !!(identityConfigured && process.env.FERROWORK_OIDC_CLIENT_ID && process.env.FERROWORK_OIDC_CLIENT_SECRET && process.env.NEXTAUTH_SECRET);

export function auth() {
  if (!configured) throw new Error('Ferrowork Identity client is not configured');
  return {
    async getSession() {
      const requestHeaders=await headers();
      const web=await webSession();
      const native=web?.user?.email?null:await identityAuth.api.getSession({headers:requestHeaders});
      const user=web?.user?.email?web.user:native?.user;
      if(!user?.email)return null;
      const [workspaceUser]=await db()`SELECT id,email,name FROM fw_users WHERE lower(email)=lower(${user.email}) AND active=true`;
      if(!workspaceUser)return null;
      return {user:{...user,email:workspaceUser.email,name:workspaceUser.name,sub:workspaceUser.id}};
    },
  };
}
