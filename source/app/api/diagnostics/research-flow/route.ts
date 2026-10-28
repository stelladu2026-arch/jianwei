import {after,NextResponse} from 'next/server';
import {env} from '@/lib/deployment/runtime-env';
import {qwenCredentials} from '@/lib/research/qwen-settings';
import {claimFlowAcceptance,executeFlowAcceptance,readFlowAcceptance,type AcceptanceCall} from '@/lib/research/full-flow-acceptance';
import {POST as createProject} from '@/app/api/projects/route';
import {GET as readProject,PATCH as changeProject} from '@/app/api/projects/[id]/route';
import {POST as runWorkflow} from '@/app/api/projects/[id]/workflow/route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(){try{const db=env.DB;if(!db)throw Error();return NextResponse.json(await readFlowAcceptance(db),{headers})}catch{return NextResponse.json({state:'storage_unavailable'},{status:503,headers})}}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({state:'same_origin_required'},{status:403,headers});
 const ref=process.env.VERCEL_GIT_COMMIT_SHA||'';
 if(process.env.VERCEL_ENV!=='production'||!/^[a-f0-9]{40}$/.test(ref))return NextResponse.json({state:'authorized_runtime_required'},{status:403,headers});
 try{
  qwenCredentials(true);
  if(env.SEMANTIC_RETRIEVAL_ENABLED==='true')return NextResponse.json({state:'embedding_not_in_this_grant'},{status:409,headers});
  const db=env.DB;if(!db)throw Error();
  const claim=await claimFlowAcceptance(db,ref);
  if(!claim.claimed)return NextResponse.json(claim.report,{headers});
  const origin=new URL(request.url).origin;
  const call:AcceptanceCall=async(path,method,body)=>{
   const req=new Request(origin+path,{method,headers:{'Content-Type':'application/json',Origin:origin},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const match=path.match(/^\/api\/projects\/([^/]+)(\/workflow)?$/);let response:Response;
   if(path==='/api/projects'&&method==='POST')response=await createProject(req);
   else if(match){const ctx={params:Promise.resolve({id:match[1]})};if(match[2]&&method==='POST')response=await runWorkflow(req,ctx);else if(!match[2]&&method==='PATCH')response=await changeProject(req,ctx);else if(!match[2]&&method==='GET')response=await readProject(req,ctx);else throw Error('FLOW_ROUTE_NOT_ALLOWED')}
   else throw Error('FLOW_ROUTE_NOT_ALLOWED');
   return {status:response.status,data:await response.json()};
  };
  after(async()=>{try{await executeFlowAcceptance({db,buildRef:ref,call})}catch{console.error('[jianwei-flow-acceptance] FLOW_RECEIPT_UNCONFIRMED; do not restart or resend.')}});
  return NextResponse.json(claim.report,{status:202,headers});
 }catch{return NextResponse.json({state:'preflight_or_storage_unconfirmed',note:'Read saved status; do not restart the grant.'},{status:503,headers})}
}
