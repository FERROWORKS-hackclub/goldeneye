import { after } from 'next/server';
import { z } from 'zod';
import { marketingSecret,marketingUser,readMarketingBody,json,MarketingError,marketingFailure,sameMarketingOrigin } from '../../../../lib/marketing';
import { verifyMarketingToken } from '../../../../lib/marketing-tokens.mjs';
import { runMarketingWorker } from '../../../../lib/marketing-mail';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request:Request){try{
 const body=await readMarketingBody(request,2000),campaignId=body.campaignId?z.uuid().parse(body.campaignId):undefined;
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const verified=verifyMarketingToken('worker',token,marketingSecret());
 const [scope,expiry]=(verified||'').split(':');
 if(!verified||scope!==(campaignId||'all')||Number(expiry)*1000<Date.now()){
  if(!sameMarketingOrigin(request))throw new MarketingError('Unauthorized worker request.',401);
  await marketingUser();
 }
 after(()=>runMarketingWorker(campaignId).catch(()=>console.error('Marketing worker continuation failed')));
 return json({queued:true},202);
}catch(error){return marketingFailure(error);}}
