import { IdentityPasswordReset } from '../auth-portal';
import { identityAuth } from '../../lib/better-auth';
import { activePasswordResetToken } from '../../lib/password-reset.mjs';
export const metadata={title:'Reset password | Ferrowork Identity',referrer:'no-referrer'};
export const dynamic='force-dynamic';

export default async function ResetPasswordPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const params=await searchParams;
  const token=await activePasswordResetToken(params,async(identifier:string)=>{
    const context=await identityAuth.$context;
    return context.internalAdapter.findVerificationValue(identifier);
  });
  return <IdentityPasswordReset token={token} valid={!!token}/>;
}
