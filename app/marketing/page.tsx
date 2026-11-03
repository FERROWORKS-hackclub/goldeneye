import { Mail,ArrowRight } from 'lucide-react';
import { loginToMarketing } from '../actions';
import { marketingUser } from '../../lib/marketing';
import Marketing from './marketing';
import './marketing.css';
export const dynamic='force-dynamic';
export const metadata={title:'Marketing | Goldeneye'};
export default async function Page(){
 try{await marketingUser();return <Marketing/>;}catch(error:any){return <main className="signin-page"><section className="signin-card"><div className="brand"><Mail size={25}/>GOLDENEYE</div><h1>Marketing</h1>{error.status===403?<><p>Staff access is required.</p><a className="primary" href="/">Back to Goldeneye</a></>:<form action={loginToMarketing}><button className="primary" type="submit">Sign in with Ferrowork<ArrowRight size={16}/></button></form>}</section></main>;}
}
