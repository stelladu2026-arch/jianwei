import {pathToFileURL} from 'node:url';
import {QWEN_BASE_URL} from '../lib/research/provider-config.ts';

// Anonymous, fixed-address HEAD only: no key, prompt, model or redirects.
export async function checkQwenNetwork(fetcher=fetch){
 const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher(QWEN_BASE_URL+'/chat/completions',{method:'HEAD',redirect:'manual',signal:controller.signal});
  return {reachable:true,httpStatus:response.status,redirect:response.status>=300&&response.status<400,modelRequests:0,elapsedMs:Date.now()-started};
 }catch(error){
  const codes=[error?.code,error?.cause?.code,...(Array.isArray(error?.cause?.errors)?error.cause.errors.map(x=>x?.code):[])];
  const has=(...values)=>codes.some(x=>values.includes(x));
  const code=controller.signal.aborted?'TIMEOUT':has('ENOTFOUND','EAI_AGAIN')?'DNS_FAILURE':has('CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE')?'TLS_FAILURE':has('UND_ERR_CONNECT_TIMEOUT','ETIMEDOUT')?'CONNECT_TIMEOUT':has('ECONNREFUSED')?'CONNECTION_REFUSED':has('ECONNRESET','UND_ERR_SOCKET')?'CONNECTION_RESET':has('EACCES','EPERM')?'NETWORK_RESTRICTED':'NETWORK_FAILURE';
  return {reachable:false,code,modelRequests:0,elapsedMs:Date.now()-started};
 }finally{clearTimeout(timer)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv.includes('--live')){console.error('未执行：需要显式 --live；只发送无凭据 HEAD，不调用模型。');process.exitCode=2;}
 else{const result=await checkQwenNetwork();console.log('[jianwei-qwen-network]',JSON.stringify(result));if(!result.reachable)process.exitCode=1;}
}
