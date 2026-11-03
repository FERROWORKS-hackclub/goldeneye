import { after } from 'next/server';
import { db } from '../../../../lib/server';
import { subscriberSchema } from '../../../../lib/marketing-validation.mjs';
import { publicCors,readMarketingBody,publicRateLimit,pendingSubscriber,json,marketingFailure,MarketingError,requestMetadata } from '../../../../lib/marketing';
import { drainMarketingQueue } from '../../../../lib/marketing-mail';
export const dynamic='force-dynamic';
export const maxDuration=60;
export function OPTIONS(request:Request){const cors=publicCors(request);return new Response(null,{status:cors?204:403,headers:cors||{}});}
export async function POST(request:Request){const cors=publicCors(request);if(!cors)return json({error:'Invalid request origin.'},403);try{
 const input=subscriberSchema.parse(await readMarketingBody(request,10000));
 if(input.website)return json({ok:true},200,cors);
 if(!input.newsletterConsent)throw new MarketingError('Please choose to receive the newsletter before subscribing.');
 if(Date.now()-input.startedAt>0&&Date.now()-input.startedAt<1500)throw new MarketingError('Please take a moment to complete the form.');
 await publicRateLimit(request,input.browserId,'newsletter');
 const deliveryId=await db().begin(tx=>pendingSubscriber(tx,{...input,auditMetadata:{...requestMetadata(request,input.metadata),browserId:input.browserId}},'Public FERROWORKER newsletter signup; explicit opt-in'));
 if(deliveryId)after(()=>drainMarketingQueue({deliveryId,limit:1}).catch(()=>console.error('Newsletter confirmation delivery pending')));
 return json({ok:true,message:'If this address needs confirmation, a link is on its way. Please check your inbox.'},200,cors);
}catch(error){return marketingFailure(error,cors);}}
