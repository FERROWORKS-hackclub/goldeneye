import Workspace from './workspace';
import { IdentitySignIn } from './auth-portal';
import {headers} from 'next/headers';
import {configured,auth} from '../lib/auth';
export const dynamic='force-dynamic';
export default async function Page(){const host=(await headers()).get('host')||'';if(host.startsWith('auth.ferroworks.org'))return <IdentitySignIn/>;const session=configured ? await auth().getSession() : null;return <Workspace configured={configured} signedIn={!!session} loginUrl="/api/login/signin/ferrowork" logoutUrl="/logout" />;}

export async function generateMetadata(){const session=configured?await auth().getSession():null;return {title:session?'Goldeneye | Ferrowork':'Ferrowork Identity'};}
