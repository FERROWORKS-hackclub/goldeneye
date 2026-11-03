'use client';
import { useState } from 'react';
import { Mail,Check,ArrowRight } from 'lucide-react';
export default function MarketingPreference({token,mode}:{token:string;mode:'unsubscribe'|'confirm'}){
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 async function submit(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{
  const endpoint=mode==='unsubscribe'?`/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`:'/api/marketing/confirm';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const data=await response.json();if(!response.ok)throw Error(data.error);setDone(true);
 }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 return <main className="identity-page"><section className="identity-card"><div className="identity-brand"><span><Mail size={19}/></span>FERROWORKS</div><div className="identity-mark">{done?<Check size={24}/>:<Mail size={24}/>}</div>
 <h1>{done?(mode==='unsubscribe'?'You’re unsubscribed.':'You’re on the list.'):(mode==='unsubscribe'?'Leave the mailing list?':'Keep in the loop.')}</h1>
 <p className="identity-copy">{done?(mode==='unsubscribe'?'You will no longer receive Ferroworks marketing emails.':'Your subscription is confirmed. We’ll share project news and launch updates from newsletter@ferroworks.org.'):(mode==='unsubscribe'?'Stop all Ferroworks newsletter and marketing emails to this address.':'Confirm that you want to receive Ferroworks project news and marketing emails. You can unsubscribe at any time.')}</p>
 {!done&&token&&<form onSubmit={submit}><button disabled={busy}>{busy?'Updating…':mode==='unsubscribe'?'Unsubscribe':'Confirm subscription'}<ArrowRight size={17}/></button></form>}
 {!token&&<p role="alert" className="identity-copy">This link is missing. Please use the link in your newsletter email.</p>}
 {error&&<p role="alert" className="identity-copy">{error}</p>}<a className="identity-text-button" href="https://ferroworks.org/">Back to Ferroworks</a></section></main>;
}
