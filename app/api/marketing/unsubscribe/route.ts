import { json,unsubscribeContact,marketingFailure } from '../../../../lib/marketing';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const token=new URL(request.url).searchParams.get('token')||'';
 await unsubscribeContact(token);return json({ok:true,message:'You have been unsubscribed from Ferroworks marketing emails.'});
}catch(error){return marketingFailure(error);}}
