'use client';
import { useState } from 'react';
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

export function IdentityPasswordReset() {
  const [password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);const token=new URLSearchParams(window.location.search).get('token')||'';const result=await client.resetPassword({newPassword:password,token});setMessage(result.error?.message||'Password updated. Return to your workspace and sign in.');setBusy(false);}
  return <main className="identity-page"><section className="identity-card"><div className="identity-brand"><span><Factory size={19}/></span>FERROWORK</div><div className="identity-mark"><ShieldCheck size={22}/></div><p className="identity-eyebrow">ACCOUNT SECURITY</p><h1>Set a password.</h1><p className="identity-copy">Use at least 12 characters with a number and a symbol.</p><form onSubmit={submit}><label htmlFor="password">New password</label><input id="password" autoComplete="new-password" minLength={12} type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>{message&&<p role="status" className="identity-copy">{message}</p>}<button disabled={busy}>{busy?'Saving':'Update password'}<ArrowRight size={17}/></button></form></section></main>;
}
