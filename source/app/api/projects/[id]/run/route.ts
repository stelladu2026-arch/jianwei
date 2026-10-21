import {saveOpportunityDraft} from '@/lib/research/opportunity-drafts';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {get,save} from '@/lib/research/store';
import {log,type Project} from '@/lib/research/domain';
import {scanReflections} from '@/lib/research/governance';
import {buildTask,completeTask,currentRun,executeModel,failTask,localStep,makeRun,reserve,SimulationModel,validateResult,errorLabels,nextTask} from '@/lib/research/execution';
import {controlRun} from '@/lib/research/execution-controls';
import {realExecutionStartReason} from '@/lib/research/execution-start';
import {evaluateFixtures} from '@/lib/research/evaluation';
import {activeWorkflow} from '@/lib/research/workflow';
import {QwenModel} from '@/lib/research/qwen-model';
import {qwenCredentials} from '@/lib/research/qwen-settings';
import {QWEN_MODEL,QWEN_MAX_ATTEMPTS,QWEN_TIMEOUT_MS} from '@/lib/research/provider-config';
const schema=z.object({version:z.number().int().positive(),callId:z.string().uuid(),action:z.enum(['start','advance','pause','resume','cancel','retry','recover','evaluate']),adapter:z.enum(['simulation','qwen','unconfigured']).default('simulation'),mode:z.enum(['single','four']).default('single'),scenario:z.enum(['normal','timeout_once','invalid_once','foreign_reference']).default('normal'),freeTierOnlyConfirmed:z.boolean().default(false),limit:z.number().int().min(1).max(12).optional()}).strict();
function record(p:Project,id:string){p.actions=[...p.actions.slice(-49),id];}
const response=(p:Project)=>NextResponse.json({project:p});
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){try{
  if(req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'请求来源不正确'},{status:403});
  const b=schema.parse(await req.json()),{id}=await ctx.params,p=await get(id);if(!p)return NextResponse.json({error:'项目不存在'},{status:404});
  if(p.actions.includes(b.callId)||p.run?.lease?.callId===b.callId||p.run?.tasks.some(t=>t.calls.some(c=>c.id===b.callId)))return response(p);
  if(p.version!==b.version)throw new Error('VERSION_CONFLICT');
  if(b.adapter==='unconfigured')throw new Error('真实模型未配置，请使用 Qwen 会话接入或模拟模式。');
  if(activeWorkflow(p))throw new Error('请先完成或取消一键研究，再单独执行模型或评测。');
  if(p.workflow?.conclusionAudit&&['ready','running'].includes(p.workflow.conclusionAudit.status))throw new Error('请先完成或结束结论复核，再进行独立执行或评测。');
  if(b.action==='start'){
    if(p.workflow?.conclusionAudit&&['ready','running'].includes(p.workflow.conclusionAudit.status))throw new Error('请先完成或结束结论复核，再开始新执行。');
    if(b.adapter==='qwen'){const reason=realExecutionStartReason(p,b.mode,b.limit??(b.mode==='single'?1:4));if(reason)throw new Error(reason);qwenCredentials(b.freeTierOnlyConfirmed);if(b.scenario!=='normal')throw new Error('研究执行不支持流程测试场景。');if((b.limit??(b.mode==='single'?1:4))>QWEN_MAX_ATTEMPTS)throw new Error('本次执行最多四次请求。');}
    const run=makeRun(p,b.mode,b.scenario,b.limit??(b.adapter==='qwen'?(b.mode==='single'?1:4):undefined));if(b.adapter==='qwen'){run.adapter='qwen';run.model=QWEN_MODEL;run.simulation=false;run.paidBudget=0;run.freeTierOnlyConfirmed=true;}if(p.run)p.runHistory=[p.run,...(p.runHistory||[])].slice(0,3);p.run=run;log(p,b.adapter==='qwen'?'创建研究执行；尚未调用研究服务':'创建模拟研究执行；没有真实模型调用');
  }else if(b.action==='evaluate'){
    if(p.run?.lease)throw new Error('请等待当前步骤完成或先暂停执行，再进行评测。');
    p.evaluations=[await evaluateFixtures(),...(p.evaluations||[])].slice(0,3);log(p,'运行固定虚构评测集；结果为流程检查，不代表模型质量');
  }else if(b.action!=='advance'){
    controlRun(p,b.action);scanReflections(p);log(p,`研究执行：${{pause:'暂停',resume:'恢复',cancel:'取消',retry:'准备重试',recover:'恢复中断检查点'}[b.action]}`);
  }else{
    if(p.archived||['paused','cancelled','completed'].includes(p.status))throw new Error('请先恢复项目研究。');
    const pending=currentRun(p),key=pending.adapter==='qwen'&&nextTask(pending)?.role?qwenCredentials(b.freeTierOnlyConfirmed):undefined;
    const {run:r,task:t}=reserve(p,b.callId);let task;
    try{if(t.role)task=buildTask(p,r,t,b.callId);}catch(e){failTask(r,t,(e as Error).message,b.callId,0);scanReflections(p);record(p,b.callId);return response(await save(p,b.version));}
    if(key){p.budget.modelCalls++;r.budget.requests=(r.budget.requests||0)+1;}
    record(p,b.callId);const reserved=await save(p,b.version),start=Date.now();let output,error='',outputIssues:string[]=[];
    const adapter=key?new QwenModel(key):new SimulationModel();
    try{if(task)output=validateResult(await executeModel(task,adapter,r.adapter==='qwen'?QWEN_TIMEOUT_MS:4000),task,issues=>{outputIssues=issues});else localStep(p,r,t);}catch(e){const code=(e as Error).message;error=code in errorLabels?code:'MODEL_REPORTED_ERROR';}
    const current=await get(id);if(!current)return NextResponse.json({error:'项目已删除，结果未写入。'},{status:409});
    if(current.version!==reserved.version||current.run?.lease?.callId!==b.callId||current.run?.id!==r.id||current.run.status!=='running'||Date.parse(current.run.lease.expires)<=Date.now()){
      // Preserve concurrent user edits. Record the interruption only while this lease is still ours.
      if(current.run?.id===r.id&&current.run.lease?.callId===b.callId){const ct=current.run.tasks.find(x=>x.id===t.id)!;failTask(current.run,ct,'EXECUTION_INTERRUPTED',b.callId,Date.now()-start);scanReflections(current);try{await save(current,current.version)}catch{}}
      return NextResponse.json({error:'研究或执行状态已改变，本次迟到结果未写入。请刷新。'},{status:409});
    }
    const cr=currentRun(current),ct=cr.tasks.find(x=>x.id===t.id)!;
    if(error){failTask(cr,ct,error,b.callId,Date.now()-start);scanReflections(current);log(current,`研究执行失败：${errorLabels[error]}；可以查看检查点`);}
    else{if(output)ct.output=output;else if(t.id==='deliver')cr.report=r.report;completeTask(cr,ct,b.callId,Date.now()-start);if(t.id==='deliver')saveOpportunityDraft(current,cr);log(current,`研究执行：${ct.label}完成；${cr.simulation?'模拟结果':'待人工核查的模型草稿'}`);}
    if(adapter instanceof QwenModel){const receipt=adapter.receipt,call=ct.calls.find(c=>c.id===b.callId);if(call){call.usage=receipt.usage;call.requestId=receipt.requestId;call.outputIssues=outputIssues.length?outputIssues:receipt.outputIssues;call.normalizations=receipt.normalizations;}}
    return response(await save(current,current.version));
  }
  record(p,b.callId);return response(await save(p,b.version));
}catch(e){const msg=e instanceof Error?e.message:'';return NextResponse.json({error:msg==='VERSION_CONFLICT'?'项目已变更，请刷新后重试。':e instanceof z.ZodError?'执行参数不正确。':msg||'执行失败，请重试。'},{status:msg==='VERSION_CONFLICT'?409:400})}}

export async function GET(_req:Request,ctx:{params:Promise<{id:string}>}){try{const p=await get((await ctx.params).id);return p?response(p):NextResponse.json({error:'项目不存在'},{status:404})}catch{return NextResponse.json({error:'读取执行状态失败'},{status:503})}}
