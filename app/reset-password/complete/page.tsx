import { Factory, ShieldCheck } from 'lucide-react';

export const metadata={title:'Password updated | Ferrowork Identity'};

export default function PasswordResetComplete(){
  return <main className="identity-page"><section className="identity-card">
    <div className="identity-brand"><span><Factory size={19}/></span>FERROWORK</div>
    <div className="identity-mark"><ShieldCheck size={22}/></div>
    <h1>Password updated.</h1>
    <p className="identity-copy">Your new password is ready. Use it to sign in to your Ferrowork tools.</p>
    <a className="primary" href="https://goldeneye.ferroworks.org/">Sign in to Goldeneye</a>
  </section></main>;
}
