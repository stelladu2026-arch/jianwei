import {pathToFileURL} from 'node:url';
import {QWEN_BASE_URL} from '../lib/research/provider-config.ts';
import {providerErrorIssues} from '../lib/research/qwen-schema.ts';

// Fixed-address preflight: anonymous HEAD; optional server-only empty JSON auth.
// No model, prompt, generation fields or redirect following.
export async function checkQwenNetwork(fetcher=fetch){
 return probeQwen(fetcher,{method:'HEAD'});
}
export async function checkQwenAuth(rawKey,fetcher=fetch){
 const key=typeof rawKey==='string'?rawKey.trim():'';
 if(!key||/[\s"'\x00-\x1f\x7f]/.test(key))return {reachable:false,code:'CREDENTIAL_NOT_CONFIGURED',modelRequests:0};
 // Empty JSON cannot request generation; credentials stay inside the server.
 return probeQwen(fetcher,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:'{}'});
}
async function probeQwen(fetcher,request){
 const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher(QWEN_BASE_URL+'/chat/completions',{...request,redirect:'manual',signal:controller.signal});
  let issues,requestId;
  if(request.method==='POST'){
   try{const body=await response.json();issues=providerErrorIssues(response.status,body);const id=body?.request_id??body?.requestId;if(typeof id==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))requestId=id;}catch{issues=['provider.http:'+response.status];}
   const id=response.headers.get('x-request-id');if(id&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))requestId=id;
  }
  return {reachable:true,httpStatus:response.status,redirect:response.status>=300&&response.status<400,modelRequests:0,elapsedMs:Date.now()-started,...(issues?{issues}:{}),...(requestId?{requestId}:{})};
 }catch(error){
  const codes=[error?.code,error?.cause?.code,...(Array.isArray(error?.cause?.errors)?error.cause.errors.map(x=>x?.code):[])];
  const has=(...values)=>codes.some(x=>values.includes(x));
  const code=controller.signal.aborted?'TIMEOUT':has('ENOTFOUND','EAI_AGAIN')?'DNS_FAILURE':has('CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE')?'TLS_FAILURE':has('UND_ERR_CONNECT_TIMEOUT','ETIMEDOUT')?'CONNECT_TIMEOUT':has('ECONNREFUSED')?'CONNECTION_REFUSED':has('ECONNRESET','UND_ERR_SOCKET')?'CONNECTION_RESET':has('EACCES','EPERM')?'NETWORK_RESTRICTED':'NETWORK_FAILURE';
  return {reachable:false,code,modelRequests:0,elapsedMs:Date.now()-started};
 }finally{clearTimeout(timer)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv.includes('--live')){console.error('未执行：需要显式 --live；默认无凭据 HEAD，--auth 追加空 JSON 鉴权；不调用模型。');process.exitCode=2;}
 else{const result=await checkQwenNetwork();console.log('[jianwei-qwen-network]',JSON.stringify(result));if(!result.reachable)process.exitCode=1;
  else if(process.argv.includes('--auth')){const auth=await checkQwenAuth(process.env.DASHSCOPE_API_KEY);console.log('[jianwei-qwen-auth-empty-json]',JSON.stringify(auth));if(!auth.reachable||[401,403].includes(auth.httpStatus))process.exitCode=1;}
 }
}
