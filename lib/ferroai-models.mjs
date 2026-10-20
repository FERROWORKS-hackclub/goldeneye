const baseModels = [
 {id:'xingchen-agi/xing4.0-29b-a4b:free',name:'Xing4.0 29B A4B',provider:'XingChen',kind:'chat',description:'General questions, writing and reasoning'},
 {id:'nvidia/nemotron-3.5-super-vl:free',name:'Nemotron 3.5 Super VL',provider:'NVIDIA',kind:'chat',description:'General assistance and visual reasoning'},
 {id:'liquid/lfm-2.5-2.6b:free',name:'LFM2.5-2.6B',provider:'LiquidAI',kind:'chat',description:'A compact model for quick questions'},
 {id:'poolside/laguna-s-2.1:free',name:'Laguna S 2.1',provider:'Poolside',kind:'chat',description:'Writing, explanations and code questions'},
 {id:'poolside/laguna-xs-2.1:free',name:'Laguna XS 2.1',provider:'Poolside',kind:'chat',description:'A smaller model for everyday assistance'},
 {id:'liquid/lfm-2.5-embedding-350m:free',name:'LFM2.5-Embedding-350M',provider:'LiquidAI',kind:'embedding',description:'Turns text into vectors; does not generate chat replies'},
 {id:'minimax/minimax-m3.1-flash:free',name:'MiniMax M3.1 Flash',provider:'MiniMax',kind:'chat',description:'Advanced reasoning with a one-million-token model context'},
 {id:'nvidia/nemotron-3-ultra-550b-a55b:free',name:'Nemotron 3 Ultra 550B',provider:'NVIDIA',kind:'chat',description:'Large-model reasoning for complex questions'},
 {id:'google/gemma-4-31b-it:free',name:'Gemma 4 31B',provider:'Google',kind:'chat',description:'General reasoning, explanations and writing'},
 {id:'thinkingmachines/inkling:free',name:'Inkling',provider:'Thinking Machines',kind:'chat',description:'Advanced assistance with a one-million-token model context'}
];
const liveModelIds=['minimax/minimax-m3.1-flash:free','nvidia/nemotron-3-ultra-550b-a55b:free','google/gemma-4-31b-it:free'];
export const ferroModels=[...baseModels.map(model=>({...model,apiModel:model.id,live:false})),...liveModelIds.map(id=>{const model=baseModels.find(candidate=>candidate.id===id);if(!model)throw Error('Unknown live model');return {...model,id:`${id}:live`,apiModel:id,name:`${model.name} Live`,live:true,description:'Searches the live web before answering, with source links'};})];
export const addedModelIds=ferroModels.slice(6).map(model=>model.id);
export const ferroRoles=['admin','manager','member','finance','viewer'];
export const defaultLimits={enabled:true,dailyRequests:100,requestsPerMinute:6,maxInputChars:24000,maxOutputTokens:2048};
export const defaultSettings={enabled:true,limits:defaultLimits,roleLimits:{},userLimits:{},allowedModels:ferroModels.map(model=>model.id),allowedRoles:ferroRoles};
export function effectiveLimits(settings, user){return {...settings.limits,...settings.roleLimits[user.role],...settings.userLimits[user.id]};}
export function limitReason(limits, counts, inputChars){
 if(inputChars>limits.maxInputChars)return `Input exceeds ${limits.maxInputChars.toLocaleString()} characters. Start a new conversation or shorten your message.`;
 if(!limits.enabled)return null;
 if(counts.daily>=limits.dailyRequests)return 'Your daily FerroAI request limit has been reached. It resets at 00:00 UTC.';
 if(counts.minute>=limits.requestsPerMinute)return 'You have reached your requests-per-minute limit. Try again in a minute.';
 return null;
}
