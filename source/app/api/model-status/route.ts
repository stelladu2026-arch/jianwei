import {NextResponse} from 'next/server';
import {qwenStatus,qwenCredentials} from '@/lib/research/qwen-settings';
import {QWEN_BASE_URL} from '@/lib/research/provider-config';
export async function GET(){return NextResponse.json(qwenStatus(),{headers:{'Cache-Control':'no-store'}});}
// Fixed-address diagnostics: anonymous HEAD or authenticated empty JSON.
// No model name, prompt, generation or redirect following is permitted.
export async function POST(request:Request){
  const started=Date.now();
  try{
    const options=await request.json().catch(()=>({})) as {action?:string};
    const auth=options.action==='auth';
    const response=await fetch(QWEN_BASE_URL+'/chat/completions',{
      method:auth?'POST':'HEAD',redirect:options.action==='redirect-check'?'error':'manual',signal:AbortSignal.timeout(10000),
      ...(auth?{headers:{'Content-Type':'application/json',Authorization:'Bearer '+qwenCredentials(true)},body:'{}'}:{})
    });
    let errorCode:string|undefined;
    if(auth){try{const body=await response.json() as {code?:unknown;error?:{code?:unknown}};const value=body.error?.code||body.code;if(typeof value==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(value))errorCode=value;}catch{}}
    return NextResponse.json({reachable:true,httpStatus:response.status,redirect:response.status>=300&&response.status<400,...(errorCode?{errorCode}:{}),elapsedMs:Date.now()-started,modelRequests:0},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const e=error as {name?:string;message?:string;cause?:{code?:string}};
    const hint=String(e.message||'')+' '+String(e.cause?.code||'');
    const code=e.name==='TimeoutError'||e.name==='AbortError'?'TIMEOUT':/redirect/i.test(hint)?'REDIRECT_FAILURE':/dns|resolve|ENOTFOUND|EAI_AGAIN|hostname/i.test(hint)?'DNS_FAILURE':/tls|ssl|cert/i.test(hint)?'TLS_FAILURE':/allow|denied|forbid|restrict|permission|blocked/i.test(hint)?'NETWORK_RESTRICTED':'NETWORK_FAILURE';
    return NextResponse.json({reachable:false,code,elapsedMs:Date.now()-started,modelRequests:0},{headers:{'Cache-Control':'no-store'}});
  }
}
