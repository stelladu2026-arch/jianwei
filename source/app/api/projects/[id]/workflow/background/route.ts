import {after,NextResponse} from 'next/server';
import {z} from 'zod';
import {log} from '@/lib/research/domain';
import {errorLabels} from '@/lib/research/execution';
import {isStorageFailure,storageFailureMessage} from '@/lib/research/storage-errors';
import {db,get,save} from '@/lib/research/store';
import {qwenCredentials} from '@/lib/research/qwen-settings';
import {queueBackground,runBackground,backgroundStatus,BackgroundStateError} from '@/lib/research/harness/background';
import {POST as advanceWorkflow} from '../route';
export const maxDuration=300;
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('start'),version:z.number().int().positive(),callId:z.string().uuid(),freeTierOnlyConfirmed:z.boolean()}).strict(),
 z.object({action:z.literal('dispatch'),ticket:z.string().min(60).max(100)}).strict(),
]);
async function kick(id:string,ticket:string){
 const host=process.env.VERCEL_URL,password=process.env.JIANWEI_ACCESS_PASSWORD;
 if(!host||!/^jianwei-[a-z0-9-]+\.vercel\.app$/.test(host)||!password)return false;
 try{
  // Fixed platform host only; never accept a URL, password or task ID from a
  // model. This uses the app's normal private authentication, not a bypass.
  const r=await fetch(`https://${host}/api/projects/${encodeURIComponent(id)}/workflow/background`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Authorization:'Basic '+Buffer.from('owner:'+password).toString('base64')},body:JSON.stringify({action:'dispatch',ticket})});
  return r.status===202;
 }catch{return false;}
}
async function work(id:string,ticket:string){
 await runBackground({db:db(),projectId:id,ticket,get,kick:t=>kick(id,t),advance:async p=>{
  const r=await advanceWorkflow(new Request('http://research.internal/workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:p.version,callId:crypto.randomUUID(),action:'advance',freeTierOnlyConfirmed:true})}),{params:Promise.resolve({id})});
  if(!r.ok)throw Error('BACKGROUND_STEP_NOT_ACCEPTED');
 }});
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{
  if(request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'请求来源不正确'},{status:403});
  const b=input.parse(await request.json()),{id}=await context.params;
  if(b.action==='dispatch'){
   // The private route also requires an unguessable, run-bound SQL grant.
   // Only its hash is persisted. Invalid grants cannot claim a worker lease.
   after(()=>work(id,b.ticket));return NextResponse.json({accepted:true},{status:202});
  }
  const p=await get(id);if(!p)return NextResponse.json({error:'项目不存在'},{status:404});
  if(p.actions.includes(b.callId))return NextResponse.json({project:p,background:await backgroundStatus(db(),id)},{status:202});
  if(p.version!==b.version)return NextResponse.json({error:'项目已变更，请刷新检查点。'},{status:409});
  qwenCredentials(b.freeTierOnlyConfirmed);
  const ticket=await queueBackground(db(),p,b.callId);
  p.actions=[...p.actions.slice(-49),b.callId];log(p,'已确认按本轮原始预算后台推进；关闭页面后可继续，失败不会自动重试');const saved=await save(p,b.version);
  if(ticket)after(()=>work(id,ticket));
  return NextResponse.json({project:saved,background:await backgroundStatus(db(),id)},{status:202});
 }catch(e){const code=e instanceof Error?e.message:'';return NextResponse.json({error:e instanceof z.ZodError?'后台任务参数不正确。':e instanceof BackgroundStateError?e.message:isStorageFailure(e)?storageFailureMessage(e,true):code==='VERSION_CONFLICT'?'项目已变更，请刷新检查点。':errorLabels[code]||'后台任务暂不可用，请刷新检查点确认结果。'},{status:isStorageFailure(e)?503:code==='VERSION_CONFLICT'?409:400});}
}
