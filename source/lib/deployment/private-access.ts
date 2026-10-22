export async function privateDeploymentAccess(authorization:string|null,password:string|undefined){
 if(!password||password.length<24)return 'unconfigured' as const;
 let submitted='';try{if(!authorization?.startsWith('Basic '))return 'denied' as const;submitted=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(authorization.slice(6)),c=>c.charCodeAt(0))); }catch{return 'denied' as const}
 const encoder=new TextEncoder(),hash=async(text:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
 const [a,b]=await Promise.all([hash(submitted),hash('owner:'+password)]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0?'allowed' as const:'denied' as const;
}
