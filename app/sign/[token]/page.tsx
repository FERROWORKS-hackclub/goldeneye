import Signer from './signer';
export const dynamic='force-dynamic';
export const metadata={title:'Sign document | FerroSign',referrer:'no-referrer',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <Signer token={token}/>}
