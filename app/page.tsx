import Workspace from './workspace';
import { IdentitySignIn } from './auth-portal';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {configured,auth} from '../lib/auth';
import {db} from '../lib/server';
import FerroSign from './ferrosign';
import FerroSignLogin from './ferrosign-login';
import {staff} from '../lib/ferrosign';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{ferrosign_sso?:string}>}){const host=(await headers()).get('host')||'';if(host.startsWith('auth.ferroworks.org'))return <IdentitySignIn/>;if(host.startsWith('sign.ferroworks.org')){if(!configured)redirect('https://goldeneye.ferroworks.org');const query=await searchParams;const session=await auth().getSession();if(!session){if(query.ferrosign_sso==='complete')redirect('https://goldeneye.ferroworks.org');return <FerroSignLogin/>}const [user]=await db()`SELECT role FROM fw_users WHERE id=${session.user.sub} AND active=true`;if(!user||!staff(user.role))redirect('https://goldeneye.ferroworks.org');return <FerroSign/>}const session=configured ? await auth().getSession() : null;return <Workspace configured={configured} signedIn={!!session} loginUrl="/api/login/signin/ferrowork" logoutUrl="/logout" />;}

export async function generateMetadata(){const host=(await headers()).get('host')||'';if(host.startsWith('sign.ferroworks.org'))return {title:'FerroSign | Ferroworks',description:'Secure document signing for Ferroworks.'};const session=configured?await auth().getSession():null;return {title:session?'Goldeneye | Ferrowork':'Ferrowork Identity'};}
