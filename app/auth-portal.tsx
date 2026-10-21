'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { ArrowRight, Factory, ShieldCheck } from 'lucide-react';

const client = createAuthClient({ baseURL: process.env.NEXT_PUBLIC_AUTH_URL || 'https://auth.ferroworks.org', plugins: [oauthProviderClient()] });

export function IdentitySignIn() {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage('');const result=await client.signIn.email({email:email.trim(),password,callbackURL:'/'});if(result.error)setMessage(result.error.message||'Could not sign in.');else window.location.assign('/');setBusy(false);}
  async function reset(){if(!email.trim()){setMessage('Enter your work email first.');return;}setBusy(true);setMessage('');const result=await client.requestPasswordReset({email:email.trim(),redirectTo:'/reset-password'});setMessage(result.error?.message||'If the account exists, a password reset email is on its way.');setBusy(false);}
  return <main className="identity-page"><section className="identity-card"><div className="identity-brand"><span><Factory size={19}/></span>FERROWORK</div><div className="identity-mark"><ShieldCheck size={22}/></div><p className="identity-eyebrow">SECURE WORKSPACE ACCESS</p><h1>Welcome back.</h1><p className="identity-copy">Sign in once to reach your Ferrowork tools.</p><form onSubmit={submit}><label htmlFor="email">Work email</label><input id="email" autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><label htmlFor="password">Password</label><input id="password" autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>{message&&<p role="status" className="identity-copy">{message}</p>}<button disabled={busy}>{busy?'Signing in':'Continue'}<ArrowRight size={17}/></button></form><button className="identity-text-button" disabled={busy} onClick={()=>void reset()}>Forgot password?</button><p className="identity-foot">Accounts are issued by your workspace administrator.</p></section></main>;
}

export function IdentityConsent() {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const params=typeof window==='undefined'?new URLSearchParams():new URLSearchParams(window.location.search);
  async function consent(accept:boolean){setBusy(true);const result=await client.oauth2.consent({accept,scope:params.get('scope')||undefined,claims:params.get('claims')||undefined});if(result.error){setError(result.error.message||'Could not update access.');setBusy(false);}}
  return <main className="identity-page"><section className="identity-card"><div className="identity-brand"><span><Factory size={19}/></span>FERROWORK</div><div className="identity-mark"><ShieldCheck size={22}/></div><p className="identity-eyebrow">APPLICATION ACCESS</p><h1>Continue to your tool?</h1><p className="identity-copy">This app requests access to your Ferrowork identity and email address.</p>{error&&<p role="alert" className="identity-error">{error}</p>}<button disabled={busy} onClick={()=>consent(true)}>Allow access<ArrowRight size={17}/></button><button className="identity-secondary" disabled={busy} onClick={()=>consent(false)}>Deny</button></section></main>;
}

export function IdentityPasswordReset({token,valid}:{token?:string;valid:boolean}) {
  const router=useRouter();
  const submitting=useRef(false);
  const completed=useRef(false);
  const [password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[email,setEmail]=useState('');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[linkValid,setLinkValid]=useState(valid),[done,setDone]=useState(false),[sent,setSent]=useState(false);

  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(submitting.current||completed.current||!linkValid||!token)return;
    if(password!==confirmPassword){setMessage('Your passwords do not match.');return;}
    submitting.current=true;setBusy(true);setMessage('');
    try{
      const result=await client.resetPassword({newPassword:password,token});
      if(result.error){
        if(result.error.code==='INVALID_TOKEN'){
          setLinkValid(false);setPassword('');setConfirmPassword('');
        }else setMessage('We couldn’t update your password. Use 12–128 characters and try again.');
        return;
      }
      completed.current=true;setDone(true);setPassword('');setConfirmPassword('');
      router.replace('/reset-password/complete');
    }catch{
      setMessage('We couldn’t confirm the update. Try signing in with your new password before requesting another link.');
    }finally{setBusy(false);submitting.current=false;}
  }

  async function requestLink(event:React.FormEvent){
    event.preventDefault();if(submitting.current)return;
    submitting.current=true;setBusy(true);setMessage('');
    try{
      const result=await client.requestPasswordReset({email:email.trim(),redirectTo:'/reset-password'});
      if(result.error)setMessage(result.error.status===429?'Please wait a minute before requesting another link.':'We couldn’t send the email. Please try again.');
      else setSent(true);
    }catch{setMessage('We couldn’t reach Ferrowork. Please try again.');}
    finally{setBusy(false);submitting.current=false;}
  }

  return <main className="identity-page"><section className="identity-card">
    <div className="identity-brand"><span><Factory size={19}/></span>FERROWORK</div>
    <div className="identity-mark"><ShieldCheck size={22}/></div>
    <p className="identity-eyebrow">ACCOUNT SECURITY</p>
    {done?<><h1>Password updated.</h1><p className="identity-copy">Your new password is ready.</p><a className="primary" href="https://goldeneye.ferroworks.org/">Sign in to Goldeneye</a></>:linkValid?<>
      <h1>Set a password.</h1><p className="identity-copy">Use 12–128 characters. This link works once.</p>
      <form onSubmit={submit}>
        <label htmlFor="password">New password</label><input id="password" autoComplete="new-password" minLength={12} maxLength={128} type="password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/>
        <label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" autoComplete="new-password" minLength={12} maxLength={128} type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required disabled={busy}/>
        {message&&<p role="alert" className="identity-copy">{message}</p>}
        <button disabled={busy}>{busy?'Saving':'Update password'}<ArrowRight size={17}/></button>
      </form>
    </>:<>
      <h1>{sent?'Check your email.':'Need a new link?'}</h1>
      <p className="identity-copy">{sent?'If your account exists, a fresh link is on its way. Use the newest email within one hour.':'This link has expired, has already been used, or is missing. If you already saved your new password, you can sign in.'}</p>
      {!sent&&<form onSubmit={requestLink}><label htmlFor="reset-email">Work email</label><input id="reset-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy}/>{message&&<p role="alert" className="identity-copy">{message}</p>}<button disabled={busy}>{busy?'Sending':'Send a new link'}<ArrowRight size={17}/></button></form>}
      <a className="identity-text-button" href="https://goldeneye.ferroworks.org/">Sign in to Goldeneye</a>
    </>}
  </section></main>;
}
