import { createHmac, timingSafeEqual } from 'node:crypto';
const sign=(purpose,value,secret)=>{if(!secret)throw Error('Marketing token signing is not configured.');return createHmac('sha256',secret).update(`ferrowork-marketing:v1:${purpose}:${value}`).digest('base64url');};
export function marketingToken(purpose,value,secret){return `${value}.${sign(purpose,value,secret)}`;}
export function verifyMarketingToken(purpose,token,secret){
 if(typeof token!=='string'||token.length>1000)return null;
 const i=token.lastIndexOf('.');if(i<1)return null;const value=token.slice(0,i),signature=token.slice(i+1);
 const actual=Buffer.from(signature),expected=Buffer.from(sign(purpose,value,secret));
 return actual.length===expected.length&&timingSafeEqual(actual,expected)?value:null;
}
