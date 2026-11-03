export async function marketingRequest(action:string,data:Record<string,unknown>={}){
 const response=await fetch('/api/marketing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Could not save this change.'),{status:response.status,data:result});return result;
}
export async function marketingGet(query=''){
 const response=await fetch('/api/marketing'+query,{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load the workspace.');return data;
}
