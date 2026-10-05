import type {Project} from './domain';
import {externalDataRule, roleRules, type Role} from './model-port';

export const roleNames:Record<Role,string>={coordinator:'研究协调',needs:'用户需求分析',commercial:'替代与商业分析',verifier:'反证核查'};
export const permissions:Record<Role,readonly string[]>={
  coordinator:['read_context','propose_plan','request_search','draft_report'],
  needs:['read_context','propose_clusters'],
  commercial:['read_context','request_alternative_search','propose_commercial'],
  verifier:['read_context','check_references','request_counter_search','propose_reflection'],
};
export type Memory={id:string;kind:'preference'|'correction'|'experience';text:string;refs:string[];revision:number;evidenceVersion:number;created:string;expires:string;status:'candidate'|'confirmed';verification:string;origin:'user'};
export type Reflection={id:string;key:string;origin:'rule'|'user';problem:string;refs:string[];cause:string;action:string;verification:string;status:'open'|'resolved';revision:number;evidenceVersion:number;created:string;resolvedAt?:string};
export function memoryState(p:Project,m:Memory,now=Date.now()):string{
  if(m.expires&&Date.parse(m.expires)<=now)return '已过期';
  if(m.revision!==p.revision)return '范围已变更';
  if(m.refs.some(id=>!p.evidence.some(e=>e.id===id&&!e.excluded)))return '引用失效';
  if(m.kind!=='preference'&&m.evidenceVersion!==(p.evidenceVersion||0))return '资料已变更';
  if(m.status!=='confirmed')return '待验证候选';
  return '可用于本项目';
}
// Proposals never execute tools. User HTTP authorization and role capability checks are separate.
export function roleContext(p:Project,role:Role,tool:string,revision:number,ids:string[]){
  if(!permissions[role]?.includes(tool))throw new Error('ROLE_PERMISSION_DENIED');
  if(p.revision!==revision)throw new Error('CONTEXT_REVISION_CONFLICT');
  if(!p.confirmed)throw new Error('请先确认研究范围。');
  if(ids.some(id=>!p.evidence.some(e=>e.id===id&&!e.excluded)))throw new Error('引用必须来自本项目未排除的资料。');
  const evidence=p.evidence.filter(e=>ids.includes(e.id));
  // First verifier pass sees originals before other interpretations.
  const memories=role==='verifier'?[]:(p.memories||[]).filter(m=>memoryState(p,m)==='可用于本项目'&&m.refs.every(id=>ids.includes(id)));
  return {project_id:p.id,revision:p.revision,version:p.version,role,requested_capability:tool,execution:'context_only',rules:[roleRules[role],externalDataRule],brief:{title:p.title,audience:p.audience,region:p.region,period:p.period,exclusions:p.exclusions,decision:p.decision},evidence,memories,opportunities:role==='verifier'||role==='needs'?[]:p.opportunities.filter(o=>!o.stale&&o.refs.every(id=>ids.includes(id))),budget:p.budget,permissions:permissions[role]};
}
export function integrityIssues(p:Project){
  const issues:{key:string;problem:string;refs:string[];action:string}[]=[];
  if(p.status==='partial')issues.push({key:'partial',problem:'采集未完整完成',refs:[],action:'核对失败来源，重试或导入替代资料；不能据此认定没有需求。'});
  if(p.workflow?.status==='failed')issues.push({key:'workflow:'+p.workflow.id+':'+p.workflow.stage,problem:'一键研究阶段失败：'+p.workflow.stage,refs:[],action:p.workflow.mode==='four'?'检查保存的错误与调用回执；本轮不追加模型重试，保留未完成状态。修复后另行安排验收，不能使用被拒结果。':'检查保存的错误与调用回执，在预算内显式重试；不得把失败或未确认结果作为研究结论。'});
  for(const t of p.run?.status==='failed'?p.run.tasks.filter(t=>t.status==='failed'):[])issues.push({key:'run:'+p.run!.id+':'+t.id,problem:'研究执行失败：'+t.label,refs:[],action:'检查步骤错误并在预算内重试；最多两次尝试，不能将错误输出作为结论。'});
  for(const o of p.opportunities){
    if(o.stale||o.revision!==p.revision)issues.push({key:'stale:'+o.id,problem:`「${o.title}」需要重新核查`,refs:o.refs,action:'回到原始证据，复核后重新保存机会卡。'});
    const invalid=o.refs.filter(id=>!p.evidence.some(e=>e.id===id&&!e.excluded));
    if(invalid.length)issues.push({key:'refs:'+o.id,problem:`「${o.title}」引用已删除或排除`,refs:invalid,action:'移除失效引用，补充本项目可用证据。'});
    if(!o.refs.length)issues.push({key:'empty:'+o.id,problem:`「${o.title}」缺少原始引用`,refs:[],action:'补充引用，或明确暂缓判断。'});
    if(!o.plan.trim())issues.push({key:'plan:'+o.id,problem:`「${o.title}」缺少验证计划`,refs:o.refs,action:'补充验证动作，以及继续和停止标准。'});
  }
  return issues;
}
export function scanReflections(p:Project){
  p.reflections??=[];
  for(const issue of integrityIssues(p)){
    if(p.reflections.some(r=>r.key===issue.key&&r.status==='open'&&r.revision===p.revision&&r.evidenceVersion===(p.evidenceVersion||0)))continue;
    if(p.reflections.length>=100)break;
    p.reflections.unshift({...issue,id:crypto.randomUUID(),origin:'rule',cause:'尚未分析原因；本检查只验证结构与引用可用性。',verification:'',status:'open',revision:p.revision,evidenceVersion:p.evidenceVersion||0,created:new Date().toISOString()});
  }
}
