import {QWEN_MODEL} from '../provider-config';
import {QUALITY_POLICY_VERSION,evidenceQualitySummary} from '../evidence-quality';
import type {Project} from '../domain';
import type {LoopInput} from '../agent-loop';
import type {HarnessDatabase} from './storage';
import {initializeHarnessDatabase} from './storage';
import {ResearchCheckpointSaver} from './checkpointer';

export type StageInput=Pick<LoopInput,'task'|'evidence'|'budget'|'since'|'allowFollowUp'|'finalizeAtLimit'>&{retrievalMode?:'lexical'|'semantic';model?:string;qualityPolicy?:string;sourceHints?:ReturnType<typeof evidenceQualitySummary>};
export async function saveStageInput(db:HarnessDatabase,thread:string,input:StageInput){
 await initializeHarnessDatabase(db);
 await db.prepare('INSERT INTO research_harness_stage_inputs (thread_id,input) VALUES (?,?) ON CONFLICT(thread_id) DO NOTHING').bind(thread,JSON.stringify(input)).run();
 const original=await loadStageInput(db,thread);
 if(JSON.stringify(original)!==JSON.stringify(input))throw Error('HARNESS_INPUT_CHANGED');
}
export async function loadStageInput(db:HarnessDatabase,thread:string):Promise<StageInput>{
 const row=await db.prepare('SELECT input FROM research_harness_stage_inputs WHERE thread_id=?').bind(thread).first<{input:string}>();
 if(!row)throw Error('HARNESS_CHECKPOINT_MISSING');return JSON.parse(row.input) as StageInput;
}
export async function stageRecovery(db:HarnessDatabase,p:Project){
 const no=(reason:string)=>({allowed:false,reason,threadId:''});const w=p.workflow;
 if(!w?.harnessVersion)return no('旧研究未启用阶段内恢复，请保留记录后开始新一轮。');
 if(!p.confirmed||p.mode!=='manual'||p.archived||['paused','completed','cancelled'].includes(p.status)||w.revision!==p.revision||w.evidenceVersion!==(p.evidenceVersion||0)||p.evidence.some(e=>e.kind==='synthetic'))return no('研究范围或资料状态已变化，不能复用旧线程。');
 if(p.run&&['ready','running','paused','failed'].includes(p.run.status)||w.conclusionAudit&&['ready','running'].includes(w.conclusionAudit.status))return no('请先结束其他执行任务。');
 if(!['failed','running'].includes(w.status))return no('当前阶段不需要恢复。');
 if(w.lease&&Date.parse(w.lease.expires)>Date.now())return no('当前请求仍在执行，请等待结果或租约到期。');
 const record=w.records.at(-1);
 if(!record?.input||!record.harnessThreadId||record.stage!==w.stage||record.harnessThreadId!==`${p.id}:${w.id}:${record.id}`)return no('当前阶段没有可复用的原始线程。');
 if(!['','MODEL_REPORTED_ERROR','EXECUTION_INTERRUPTED'].includes(w.error))return no('本阶段未通过模型或业务检查，不能用线程恢复放行被拒结果。');
 try{
  const unknown=await db.prepare("SELECT COUNT(*) AS n FROM research_harness_operations WHERE thread_id=? AND state!='done'").bind(record.harnessThreadId).first<{n:number}>();
  if(unknown?.n)return no('请求结果不明，不能自动重发。请保留记录并核查服务用量。');
  const snapshot=await loadStageInput(db,record.harnessThreadId);
  if(snapshot.model!==QWEN_MODEL||snapshot.qualityPolicy!==QUALITY_POLICY_VERSION)return no('模型或证据边界协议已变化，不能复用旧线程；请保留记录后准备新阶段。');
  if(snapshot.task.call_id!==record.id||snapshot.task.run_id!==w.id||snapshot.task.project_id!==p.id||snapshot.task.revision!==p.revision)return no('原始输入与当前研究不一致。');
  const checkpoint=await new ResearchCheckpointSaver(db).getTuple({configurable:{thread_id:record.harnessThreadId}});
  if(!checkpoint)return no('尚无可恢复的执行检查点。');
  return {allowed:true,reason:'复用原始输入和已确认结果；后续新请求仍计入本轮剩余上限。',threadId:record.harnessThreadId};
 }catch{return no('执行检查点暂不可读取，请稍后刷新。');}
}
