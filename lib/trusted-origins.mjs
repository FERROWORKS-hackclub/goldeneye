function configuredBaseUrls(){
 return (process.env.APP_BASE_URL||'').split(',').map(value=>value.trim()).filter(Boolean);
}

export function primaryAppBaseUrl(){
 const [baseUrl]=configuredBaseUrls();
 if(!baseUrl)return null;
 try{return new URL(baseUrl).origin;}catch{return null;}
}

export function isTrustedOrigin(origin){
 if(!origin)return false;
 let requestOrigin;
 try{requestOrigin=new URL(origin).origin;}catch{return false;}
 return configuredBaseUrls().some(baseUrl=>{
  try{return new URL(baseUrl).origin===requestOrigin;}catch{return false;}
 });
}
