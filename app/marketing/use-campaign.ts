'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { applyCampaignOperation,operationKey } from '../../lib/marketing-validation.mjs';
import { marketingGet,marketingRequest } from './api';
type Pending={id:string;operation:any;baseVersion:number;conflict?:boolean;snapshot?:any};
export function useCampaign(id:string){
 const [campaign,setCampaign]=useState<any>(null),[presence,setPresence]=useState<any[]>([]),[deliveries,setDeliveries]=useState<any[]>([]),[error,setError]=useState(''),[pendingCount,setPendingCount]=useState(0),[conflicts,setConflicts]=useState<string[]>([]);
 const current=useRef<any>(null),pending=useRef(new Map<string,Pending>()),busy=useRef(false),active=useRef(true),clientId=useRef(''),field=useRef(''),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const publish=useCallback((remote:any)=>{
  if(!active.current)return;
  let merged=remote;
  for(const [key,entry] of pending.current){try{merged=applyCampaignOperation(merged,entry.operation,false);}catch{entry.conflict=true;}}
  current.current=merged;setCampaign(merged);setPendingCount(pending.current.size);setConflicts([...pending.current].filter(([,v])=>v.conflict).map(([k])=>k));
 },[]);
 const refresh=useCallback(async()=>{
  try{const data=await marketingGet(`?resource=campaign&id=${id}`);if(active.current){publish(data.campaign);setPresence(data.presence||[]);setDeliveries(data.deliveries||[]);}}
  catch(e){if(active.current)setError((e as Error).message);}
 },[id,publish]);
 const pump=useCallback(async()=>{
  if(busy.current)return;busy.current=true;
  try{
   while(active.current){
    const next=[...pending.current].find(([,entry])=>!entry.conflict);if(!next)break;
    const [key,entry]=next;
    try{
     const data=await marketingRequest('edit-campaign',{campaignId:id,operationId:entry.id,operation:entry.operation,baseVersion:entry.baseVersion});
     const latest=pending.current.get(key);
     if(latest?.id===entry.id)pending.current.delete(key);
     // Rebase only our own following edits to the same field / block order.
     for(const value of pending.current.values())if(operationKey(value.operation)===operationKey(entry.operation))value.baseVersion=data.campaign.version;
     publish(data.campaign);setError('');
    }catch(e:any){
     if(e.status===409&&e.data?.conflict){const latest=pending.current.get(key);if(latest)latest.conflict=true;publish(e.data.campaign);setError('Another editor changed the same content. Choose which version to keep.');continue;}
     setError(e.message);break;
    }
   }
  }finally{busy.current=false;if(active.current)setPendingCount(pending.current.size);}
 },[id,publish]);
 function change(operation:any){
  const doc=current.current;if(!doc||doc.status!=='draft')return;
  const opKey=operationKey(operation),key=opKey==='structure'?`structure:${crypto.randomUUID()}`:opKey;
  const old=pending.current.get(key);
  pending.current.set(key,{id:crypto.randomUUID(),operation,baseVersion:old?.baseVersion??doc.version,snapshot:doc.blocks.find((b:any)=>b.id===operation.blockId),conflict:old?.conflict});
  try{const next=applyCampaignOperation(doc,operation,false);current.current=next;setCampaign(next);setPendingCount(pending.current.size);}catch(e){setError((e as Error).message);}
  if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void pump(),600);
 }
 function resolve(key:string,keepMine:boolean){
  const entry=pending.current.get(key);if(!entry)return;
  if(!keepMine)pending.current.delete(key);
  else{
   if(entry.operation.kind==='field'&&!current.current.blocks.some((b:any)=>b.id===entry.operation.blockId)&&entry.snapshot){entry.operation={kind:'insert',block:{...entry.snapshot,[entry.operation.field]:entry.operation.value},beforeId:null};}
   entry.id=crypto.randomUUID();entry.baseVersion=current.current.version;entry.conflict=false;
  }
  setConflicts([...pending.current].filter(([,v])=>v.conflict).map(([k])=>k));void refresh().then(()=>pump());
 }
 useEffect(()=>{
  active.current=true;clientId.current=crypto.randomUUID();void refresh();
  const poll=setInterval(()=>{if(document.visibilityState==='visible'&&!busy.current)void refresh();},1800);
  const heartbeat=()=>{if(document.visibilityState==='visible')void marketingRequest('presence',{campaignId:id,clientId:clientId.current,field:field.current}).catch(()=>{});};
  heartbeat();const presenceTimer=setInterval(heartbeat,8000);
  const unload=(event:BeforeUnloadEvent)=>{if(pending.current.size){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',unload);
  return()=>{active.current=false;clearInterval(poll);clearInterval(presenceTimer);if(timer.current)clearTimeout(timer.current);window.removeEventListener('beforeunload',unload);};
 },[id,refresh]);
 return {campaign,presence:presence.filter(p=>p.client_id!==clientId.current),deliveries,error,pendingCount,conflicts,change,resolve,refresh,focus:(key:string)=>{field.current=key;},conflictValue:(key:string)=>pending.current.get(key)?.operation.value||'Block order / content'};
}
