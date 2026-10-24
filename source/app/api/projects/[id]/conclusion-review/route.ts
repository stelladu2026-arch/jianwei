import {NextResponse} from 'next/server';
import {z} from 'zod';
import {get,save} from '@/lib/research/store';
import {log,type Project} from '@/lib/research/domain';
import {createAudit,auditTask,auditSourceHash,locateAudit,auditRetryBlockReason,AUDIT_FORMAT} from '@/lib/research/conclusion-audit';
import {QwenModel} from '@/lib/research/qwen-model';
import {qwenCredentials} from '@/lib/research/qwen-settings';
import {executeModel,errorLabels} from '@/lib/research/execution';
import {QWEN_TIMEOUT_MS} from '@/lib/research/provider-config';
const input=z.object({version:z.number().int().positive(),callId:z.string().uuid(),action:z.enum(['start','advance','cancel','recover','retry']),freeTierOnlyConfirmed:z.boolean().default(false)}).strict();
const response=(p:Project)=>NextResponse.json({project:p});
function remember(p:Project,id:string){p.actions=[...p.actions.slice(-49),id];}
export const maxDuration=300;
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){try{
 if(request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'请求来源不正确'},{status:403});
 const b=input.parse(await request.json()),{id}=await ctx.params,p=await get(id);if(!p)return NextResponse.json({error:'项目不存在'},{status:404});
 if(p.actions.includes(b.callId)||p.workflow?.conclusionAudit?.callId===b.callId)return response(p);
 if(p.version!==b.version)throw new Error('VERSION_CONFLICT');
 if(b.action==='start'){
  qwenCredentials(b.freeTierOnlyConfirmed);
  const audit=await createAudit(p);p.workflow!.conclusionAudit=audit;remember(p,b.callId);log(p,'创建结论复核检查点；本阶段上限 2 次，尚未调用模型，不自动重试');return response(await save(p,b.version));
 }
 const a=p.workflow?.conclusionAudit;if(!a)throw new Error('请先创建结论复核检查点。');
 if(b.action==='retry'){
  const reason=auditRetryBlockReason(p);if(reason)throw Error(reason);
  if(await auditSourceHash(p)!==a.sourceHash)throw Error('结论或输入已变更，不能重试旧复核。');
  a.status='ready';a.error='';remember(p,b.callId);log(p,'准备手动重试结论复核；保留首轮请求记录，尚未追加模型调用');return response(await save(p,b.version));
 }
 if(b.action==='cancel'){
  if(!['ready','running','failed'].includes(a.status))throw new Error('当前结论复核无需结束。');
  a.status='cancelled';a.lease=undefined;remember(p,b.callId);log(p,'结束结论复核，保留已花费请求与已有结论');return response(await save(p,b.version));
 }
 if(b.action==='recover'){
  if(a.status!=='running'||!a.lease||Date.parse(a.lease.expires)>Date.now())throw new Error('检查点尚未过期，请等待、刷新或结束复核。');
  a.status='failed';a.error='EXECUTION_INTERRUPTED';a.lease=undefined;remember(p,b.callId);log(p,'恢复过期结论复核；已发出的一次请求保留，用量未知，不追加请求');return response(await save(p,b.version));
 }
 if(a.status!=='ready'||a.lease||a.budget.modelAttempts>=a.budget.modelLimit)throw new Error('结论复核未就绪或阶段次数已用完；请查看记录，不会自动重试。');
 if(await auditSourceHash(p)!==a.sourceHash)throw new Error('结论或输入已变更，请结束复核并以当前输入完成新研究。');
 const key=qwenCredentials(b.freeTierOnlyConfirmed),task=auditTask(p,a,b.callId);
 a.budget.modelAttempts++;p.budget.modelCalls++;a.status='running';a.callId=b.callId;a.started=new Date().toISOString();a.input=structuredClone(task);a.lease={callId:b.callId,expires:new Date(Date.now()+75000).toISOString()};remember(p,b.callId);
 const reserved=await save(p,b.version),adapter=new QwenModel(key),start=Date.now();let result:ReturnType<typeof locateAudit>|undefined,error='',issues:string[]=[];
 try{const output=await executeModel(task,adapter,QWEN_TIMEOUT_MS);result=locateAudit({review_format:AUDIT_FORMAT,status:output.status,data:output.data,gaps:output.gaps},task,value=>{issues=value});}
 catch(e){const code=(e as Error).message;error=code in errorLabels?code:'MODEL_REPORTED_ERROR';}
 const current=await get(id),ca=current?.workflow?.conclusionAudit;
 if(!current||current.version!==reserved.version||ca?.id!==a.id||ca.lease?.callId!==b.callId||ca.status!=='running'||Date.parse(ca.lease.expires)<=Date.now()){
  if(current&&ca?.id===a.id&&ca.status==='running'&&ca.lease?.callId===b.callId){ca.status='failed';ca.error='EXECUTION_INTERRUPTED';ca.lease=undefined;try{await save(current,current.version)}catch{}}
  return NextResponse.json({error:'项目、输入或执行状态已改变，本次迟到结果未写入。请刷新检查点。'},{status:409});
 }
 // Recheck the source, even if a future caller forgets to invalidate an edit.
 try{if(await auditSourceHash(current)!==ca.sourceHash)throw new Error('EXECUTION_INTERRUPTED');}catch{error='EXECUTION_INTERRUPTED';result=undefined;}
 ca.lease=undefined;ca.elapsedMs=Date.now()-start;ca.usage=adapter.receipt.usage;ca.requestId=adapter.receipt.requestId;ca.outputIssues=issues.length?issues:adapter.receipt.outputIssues;
 (ca.calls||=[]).push({id:b.callId,error,elapsedMs:ca.elapsedMs,usage:ca.usage,requestId:ca.requestId,outputIssues:ca.outputIssues});
 if(error){ca.status='failed';ca.error=error;log(current,'结论复核已停止：'+errorLabels[error]+'；不自动追加模型请求');}
 else{ca.status='completed';ca.checks=result!.checks;ca.gaps=result!.gaps;log(current,'结论复核完成，保留模型判断供人工核查；未改写原草稿、机会卡或记忆');}
 return response(await save(current,current.version));
}catch(e){const msg=e instanceof Error?e.message:'';return NextResponse.json({error:msg==='VERSION_CONFLICT'?'项目已变更，请刷新检查点后重试。':e instanceof z.ZodError?'结论复核参数不正确。':errorLabels[msg]||msg||'结论复核失败，请刷新检查点。'},{status:msg==='VERSION_CONFLICT'?409:400})}}
export async function GET(_request:Request,ctx:{params:Promise<{id:string}>}){try{const p=await get((await ctx.params).id);return p?response(p):NextResponse.json({error:'项目不存在'},{status:404})}catch{return NextResponse.json({error:'读取结论复核失败，请刷新检查点。'},{status:503})}}
