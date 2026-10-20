import Workspace from './workspace';
import {configured,auth} from '../lib/auth';
export const dynamic='force-dynamic';
export default async function Page(){const session=configured ? await auth().getSession() : null; return <Workspace configured={configured} signedIn={!!session} />;}

export async function generateMetadata(){const session=configured?await auth().getSession():null;return {title:session?'Goldeneye | Ferrowork':'Ferrowork | Sign in'};}
