import { after } from 'next/server';
import { publicSurveySchema } from '../../../../lib/marketing-validation.mjs';
import { publicCors,readMarketingBody,publicRateLimit,savePublicSurvey,json,marketingFailure,MarketingError } from '../../../../lib/marketing';
import { drainMarketingQueue } from '../../../../lib/marketing-mail';
export const dynamic='force-dynamic';
export const maxDuration=60;
export function OPTIONS(request:Request){const cors=publicCors(request);return new Response(null,{status:cors?204:403,headers:cors||{}});}
export async function POST(request:Request){const cors=publicCors(request);if(!cors)return json({error:'Invalid request origin.'},403);try{
 const input=publicSurveySchema.parse(await readMarketingBody(request,20000));
 if(input.website)return json({ok:true},200,cors);
 if(Date.now()-input.startedAt>0&&Date.now()-input.startedAt<1500)throw new MarketingError('Please take a moment to complete the form.');
 await publicRateLimit(request,input.browserId,'survey');
 const result=await savePublicSurvey(input,request);
 if(result.confirmation)after(()=>drainMarketingQueue({deliveryId:result.confirmation!,limit:1}).catch(()=>console.error('Newsletter confirmation delivery pending')));
 return json({ok:true,id:result.id,message:input.newsletterConsent?'Your answers are saved. Check your email to confirm your newsletter subscription.':'Your answers are saved. Thank you for helping shape FERROWORKER.'},200,cors);
}catch(error){return marketingFailure(error,cors);}}
