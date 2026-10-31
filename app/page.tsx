import Workspace from './workspace';
import { IdentitySignIn } from './auth-portal';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {configured,auth} from '../lib/auth';
import FerroSign from './ferrosign';
import {currentUser,staff} from '../lib/ferrosign';
export const dynamic='force-dynamic';
export default async function Page(){const host=(await headers()).get('host')||'';if(host.startsWith('auth.ferroworks.org'))return <IdentitySignIn/>;if(host.startsWith('sign.ferroworks.org')){const user=await currentUser();if(!user)redirect('/api/login/signin/ferrowork?callbackUrl=%2F');if(!staff(user.role))redirect('https://goldeneye.ferroworks.org');return <FerroSign/>}const session=configured ? await auth().getSession() : null;return <Workspace configured={configured} signedIn={!!session} loginUrl="/api/login/signin/ferrowork" logoutUrl="/logout" />;}

export async function generateMetadata(){const host=(await headers()).get('host')||'';if(host.startsWith('sign.ferroworks.org'))return {title:'FerroSign | Ferroworks',description:'Secure document signing for Ferroworks.'};const session=configured?await auth().getSession():null;return {title:session?'Goldeneye | Ferrowork':'Ferrowork Identity'};}
