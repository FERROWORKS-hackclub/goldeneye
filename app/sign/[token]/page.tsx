import Signer from './signer';
import { redirect } from 'next/navigation';
import { db } from '../../../lib/server';
import { digest } from '../../../lib/ferrosign';
import { usableSigningLink } from '../../../lib/ferrosign-validation.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Sign document | FerroSign',referrer:'no-referrer',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;const [recipient]=await db()`SELECT r.token_expires_at FROM fw_sign_recipients r JOIN fw_sign_documents d ON d.id=r.document_id WHERE r.token_hash=${digest(token)} AND d.status IN ('sent','completed')`;if(!usableSigningLink(recipient))redirect('https://goldeneye.ferroworks.org');return <Signer token={token}/>}
