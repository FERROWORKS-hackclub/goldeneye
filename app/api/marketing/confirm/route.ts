import { readMarketingBody,confirmSubscription,json,marketingFailure } from '../../../../lib/marketing';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const data=await readMarketingBody(request,2000);await confirmSubscription(String(data.token||''));return json({ok:true});}catch(error){return marketingFailure(error);}}
