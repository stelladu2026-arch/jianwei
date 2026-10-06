import type {Project,Evidence} from './domain';
import type {ModelTask,ModelResult} from './model-port';
import {buildTask,makeRun,reserve,failTask,type Run,type Analysis} from './execution';
import {collaborationReport,type FrozenInput,type Comparison,type LocatedCheck} from './collaboration';
import {sourceCoverage} from './source-coverage';
import type {Collection} from './collection';
export const WORKFLOW_VERSION='opportunity-workflow/2';
export const workflowStages={plan:'规划检索',collect:'采集公开资料',analyze:'归纳机会与反证',gap:'判断证据缺口',supplement:'补充检索',reanalyze:'复核机会判断',check:'校验引用与结构',deliver:'保存研究草稿',needs:'需求分析',commercial:'替代与商业分析',verifier:'独立反证核查',synthesis:'协调汇总与核查'};
export function stagesFor(w?:ResearchWorkflow){const keys:WorkflowStage[]=w?.mode==='four'?['needs','commercial','verifier','synthesis','check','deliver']:['plan','collect','analyze','gap','supplement','reanalyze','check','deliver'];return Object.fromEntries(keys.map(k=>[k,workflowStages[k]]));}
export type WorkflowStage=keyof typeof workflowStages;
export type WorkflowRecord={id:string;stage:WorkflowStage;kind:'model'|'source'|'local';state:'running'|'done'|'failed';started:string;elapsedMs:number;error:string;supportChecks?:LocatedCheck[];outputIssues?:string[];normalizations?:string[];usage?:ModelResult['usage'];requestId?:string;input?:ModelTask;output?:ModelResult;collection?:Omit<Collection,'evidence'> & {added:number;duplicate:number;titleOnly:number}};
export type ResearchWorkflow={mode?:'single'|'four';frozen?:FrozenInput;comparison?:Comparison;id:string;version:string;revision:number;evidenceVersion:number;created:string;status:'ready'|'running'|'paused'|'failed'|'completed'|'partial'|'cancelled'|'stale';stage:WorkflowStage;allowSupplement:boolean;queries:{query:string;purpose:'initial'|'supplement';reason:string}[];collectIndex:number;usableIds:string[];freshIds:string[];limitations:string[];records:WorkflowRecord[];budget:{modelLimit:2|4;modelAttempts:number;sourceLimit:30;sourceAttempts:number;searchLimit:3;searches:number};lease?:{callId:string;expires:string};analysisRun?:Run;initialAnalysis?:Run;error:string;needsRetry:boolean;report:string;since:number|null};
export function activeWorkflow(p:Project){return !!p.workflow&&['ready','running','paused','failed'].includes(p.workflow.status);}
export function sinceForPeriod(period:string,now=Date.now()){
  const normalized=period.trim();if(/不限|全部|所有时间/.test(normalized))return null;
  const match=normalized.match(/近\s*(\d+|一|三|六|半)\s*(年|个月|月|天)/);
  if(!match)return null;
  const values:Record<string,number>={一:1,三:3,六:6,半:0.5};const n=Number(match[1])||values[match[1]];if(!Number.isFinite(n)||n<=0)return null;
  const days=n*(match[2]==='年'?365:match[2]==='天'?1:30);
  return Math.floor((now-Math.min(days,3650)*86400000)/1000);
}
export function makeWorkflow(p:Project,allowSupplement:boolean,mode:'single'|'four'='single'):ResearchWorkflow{
  if(!p.confirmed||['paused','cancelled','completed'].includes(p.status)||p.archived)throw new Error('请先确认并恢复研究范围。');
  if(p.mode==='replay'||p.evidence.some(e=>e.kind==='synthetic'))throw new Error('一键研究需要无虚构资料的真实研究项目，请新建项目。');
  if(activeWorkflow(p)||p.run&&['ready','running','paused','failed'].includes(p.run.status))throw new Error('请先完成或取消当前执行。');
  if(mode==='single'&&(p.budget.searches>3||p.evidence.length>70))throw new Error('本项目剩余采集空间不足，请新建研究项目。');
  const since=sinceForPeriod(p.period);
  return {mode,id:crypto.randomUUID(),version:WORKFLOW_VERSION,revision:p.revision,evidenceVersion:p.evidenceVersion||0,created:new Date().toISOString(),status:'ready',stage:mode==='four'?'needs':'plan',allowSupplement:mode==='single'&&allowSupplement,queries:[],collectIndex:0,usableIds:[],freshIds:[],limitations:mode==='four'?['本轮只复核冻结的已有资料；来源、人群、地域与时间覆盖需结合原始采集记录核查。']:['仅覆盖 Hacker News 英语技术社区，不代表全部用户或目标地域。','每个检索词最多 3 帖，每帖最多 2 条一级评论；未遍历完整评论树或外链。',...(since===null&&!/不限|全部|所有时间/.test(p.period)?['无法把当前时间描述转换为日期过滤，原始日期已保留，时间匹配需人工核查。']:[])],records:[],budget:{modelLimit:mode==='four'||allowSupplement?4:2,modelAttempts:0,sourceLimit:30,sourceAttempts:0,searchLimit:3,searches:0},error:'',needsRetry:false,report:'',since};
}
export function currentWorkflow(p:Project){const w=p.workflow;if(!w)throw new Error('尚未创建一键研究。');if(w.revision!==p.revision||w.evidenceVersion!==(p.evidenceVersion||0)||w.status==='stale')throw new Error('研究范围或资料已改变，请取消旧流程并重新开始。');return w;}
function brief(p:Project,w:ResearchWorkflow){return {title:p.title,audience:p.audience,region:p.region,period:p.period,exclusions:p.exclusions,decision:p.decision,source_scope:'仅 Hacker News 英语技术社区；无法证实目标地域、人群及交易，必须说明覆盖偏差。',source_time_filter:w.since===null?'未按日期过滤':new Date(w.since*1000).toISOString().slice(0,10)+' 至检索当日'};}
export function plannerTask(p:Project,w:ResearchWorkflow,id:string):ModelTask{
  const previous=w.stage==='gap'?w.analysisRun?.tasks.find(t=>t.role==='coordinator')?.output:undefined;
  const b=brief(p,w);if(w.stage==='gap')b.title+='（根据已有草稿判断是否需要一次可检索补证）';
  const task:ModelTask={project_id:p.id,run_id:w.id,revision:p.revision,call_id:id,role:'needs',purpose:w.stage==='gap'?'gap_plan':'search_plan',brief:{...b,previous_queries:JSON.stringify(w.queries.map(q=>q.query)),known_gaps:JSON.stringify(previous?.gaps||[])},evidence_ids:[],evidence:[],context:{rules:[],memories:[],prior_results:previous?[{task_id:'first_analysis',role:'coordinator',data:previous.data}]:[],simulation:false,attempt:w.budget.modelAttempts+1,scenario:'normal'}};
  if(JSON.stringify(task).length>16000)throw new Error('CONTEXT_LIMIT');return task;
}
export function planningQueries(output:ModelResult&{data:Analysis},w:ResearchWorkflow){
  if(output.evidence_ids.length||output.data.notes.some(n=>n.refs.length)||output.data.proposal)throw new Error('INVALID_MODEL_OUTPUT');
  if(w.stage==='gap'&&output.status==='ok'){
    if(output.data.notes.length!==1||output.data.notes[0].claim!=='STOP')throw new Error('INVALID_MODEL_OUTPUT');return [];
  }
  const notes=output.data.notes;if(notes.length>(w.stage==='gap'?1:2)||w.stage==='gap'&&output.status!=='partial')throw new Error('INVALID_MODEL_OUTPUT');
  const queries=notes.map(n=>n.claim.trim());
  if(queries.some(q=>q.length<2||q.length>100||q.split(/\s+/).length>3||!/[A-Za-z]/.test(q)||/[^\x20-\x7E]|https?:|www\.|@/.test(q)))throw new Error('INVALID_MODEL_OUTPUT');
  const normalize=(q:string)=>q.toLowerCase().replace(/\s+/g,' ');
  if(new Set(queries.map(normalize)).size!==queries.length||queries.some(q=>w.queries.some(old=>normalize(old.query)===normalize(q))))throw new Error('INVALID_MODEL_OUTPUT');return queries;
}
function analysisEvidence(p:Project,w:ResearchWorkflow){
  const allowed=new Set([...w.usableIds,...p.evidence.filter(e=>e.kind==='imported').map(e=>e.id)]),fresh=new Set(w.freshIds);
  const current=p.evidence.filter(e=>allowed.has(e.id)&&!e.excluded&&e.kind!=='synthetic');
  const cited=new Set(w.initialAnalysis?.tasks.find(t=>t.role==='coordinator')?.output?.data.proposal?.refs||[]);
  // Keep cited earlier items, new bodies and different threads before duplicate contexts.
  return [...current.filter(e=>cited.has(e.id)).slice(0,4),...current.filter(e=>fresh.has(e.id)&&!cited.has(e.id)),...current.filter(e=>!fresh.has(e.id)&&!cited.has(e.id))].filter((e,i,all)=>all.findIndex(x=>x.id===e.id)===i);
}
export function analysisTask(p:Project,w:ResearchWorkflow,id:string){
  const evidence=analysisEvidence(p,w);if(!evidence.length)throw new Error('NO_USABLE_EVIDENCE');
  const temporary:Project={...p,run:undefined,evidence};const r=makeRun(temporary,'single','normal',1);r.adapter='qwen';r.model='qwen3.7-plus';r.paidBudget=0;r.freeTierOnlyConfirmed=true;r.simulation=false;
  temporary.run=r;const reserved=reserve(temporary,id);const task=buildTask(temporary,r,reserved.task,id);task.brief={...task.brief,...brief(p,w)};
  task.context!.rules.push('按问题主题归纳需求，保留不同作者和线程；不要把同一讨论计作多个客户。优先给出一个可验证的机会及其商业假设、已有替代、反证和下一步验证计划。公开自述和点击兴趣不能升级成真实付费承诺。');
  if(JSON.stringify(task).length>16000)throw new Error('CONTEXT_LIMIT');reserved.task.context!.characters=JSON.stringify(task).length;reserved.task.inputSnapshot=structuredClone(task);w.analysisRun=r;return task;
}
export function stopWithoutEvidence(p:Project,w:ResearchWorkflow){w.status='partial';w.error='NO_USABLE_EVIDENCE';w.lease=undefined;p.status='partial';w.report=`# 一键研究部分完成：${p.title}\n\n未取得足够的可分析原文，未形成产品机会判断。没有搜到资料不代表没有需求。\n\n检索词：${w.queries.map(q=>q.query).join('；')}\n来源请求尝试：${w.budget.sourceAttempts}；模型请求尝试：${w.budget.modelAttempts}\n\n${w.limitations.map(x=>'- '+x).join('\n')}\n\n下一步：调整人群或检索词，或导入有来源的访谈资料后重新研究。\n`;}
export function workflowRetryBlockReason(p:Project){
  const w=p.workflow;if(!w||w.status!=='failed')return '当前没有失败步骤。';
  if(w.mode==='four'&&!['check','deliver'].includes(w.stage))return '四角色预算仅覆盖各角色一次，失败请求仍占用预算；本轮不能追加重试。';
  if(['plan','analyze','gap','reanalyze'].includes(w.stage)&&w.budget.modelAttempts>=w.budget.modelLimit)return '模型调用预算已用完，不能重试。';
  if(['collect','supplement'].includes(w.stage)&&(w.budget.sourceAttempts+10>w.budget.sourceLimit||w.budget.searches>=w.budget.searchLimit||p.budget.searches>=6))return '采集预算已用完，不能重试。';
  if(['check','deliver'].includes(w.stage)){const t=w.analysisRun?.tasks.find(t=>t.id===w.stage);if(!t||t.attempts>=2)return '该本地步骤已达到重试上限。';}
  return '';
}
export function controlWorkflow(p:Project,action:'pause'|'resume'|'cancel'|'retry'|'recover'){
  const w=p.workflow;if(!w)throw new Error('尚未创建一键研究。');
  if(action==='cancel'){interrupt(w);w.status='cancelled';w.lease=undefined;return;}
  currentWorkflow(p);
  if(action==='pause'){if(!['ready','running','failed'].includes(w.status))throw new Error('当前不能暂停。');interrupt(w);w.status='paused';w.lease=undefined;return;}
  if(action==='resume'){if(w.status!=='paused'||['paused','cancelled'].includes(p.status))throw new Error('请先恢复项目研究。');w.status=w.needsRetry?'failed':'ready';return;}
  if(action==='recover'){if(!w.lease||Date.parse(w.lease.expires)>Date.now())throw new Error('检查点尚未过期。');interrupt(w);w.status='failed';w.lease=undefined;return;}
  const reason=workflowRetryBlockReason(p);if(reason)throw new Error(reason);
  if(['check','deliver'].includes(w.stage)){const r=w.analysisRun!,t=r.tasks.find(t=>t.id===w.stage)!;t.status='pending';t.error='';r.status='ready';r.lease=undefined;}
  w.status='ready';w.needsRetry=false;w.error='';
}
function interrupt(w:ResearchWorkflow){
  const record=w.records.find(r=>r.id===w.lease?.callId);if(!record)return;
  record.state='failed';record.error='EXECUTION_INTERRUPTED';record.elapsedMs=Date.now()-Date.parse(record.started);w.error=record.error;w.needsRetry=true;
  const r=w.analysisRun;if(r?.lease){const task=r.tasks.find(t=>t.id===r.lease?.taskId);if(task)failTask(r,task,record.error,r.lease.callId,record.elapsedMs);}
}
export function workflowReport(p:Project,w:ResearchWorkflow){
  const selected=p.evidence.filter(e=>(w.usableIds.includes(e.id)||w.mode!=='four'&&e.kind==='imported')&&!e.excluded);
  const coverage=sourceCoverage(w.frozen?.evidence||selected);
  const sources=w.records.filter(r=>r.collection).map(r=>{const c=r.collection!;return `- ${r.stage==='supplement'?'补搜':'初搜'}「${c.query}」：新增 ${c.added} 条正文；重复 ${c.duplicate} 条；无可分析正文 ${c.titleOnly} 条；请求失败 ${c.failed} 次。`}).join('\n');
  const usage=w.records.filter(r=>r.kind==='model'&&r.usage).map(r=>r.usage!);
  const directory=selected.slice(0,30).map(e=>`### [${e.id}] ${e.title}\n资料日期：${e.date||'未知'}；抓取时间：${e.fetched||'未知'}；讨论线程：${e.thread}；${e.truncated?'原文已裁剪':'已保存正文'}\n\n${e.text}\n\n${e.url}`).join('\n\n');
  return `# 一键研究草稿：${p.title}\n\n**公开资料与模型推断，待人工核查；不代表市场或付费已验证。**\n研究版本：${p.revision}；资料版本：${p.evidenceVersion||0}；流程：${w.version}；模式：${w.mode==='four'?'四角色复核':'单角色研究'}\n模型请求尝试：${w.budget.modelAttempts} / ${w.budget.modelLimit}；有用量回执 ${usage.length} 次；输入 / 输出词元 ${usage.reduce((n,u)=>n+u.input_tokens,0)} / ${usage.reduce((n,u)=>n+u.output_tokens,0)}。缺失回执的用量未知。付费预算 ¥0，实际费用待百炼账单核对。\n\n## 来源覆盖\n${coverage.publicCount} 条公开正文；${coverage.importedCount} 条导入资料；${coverage.threadCount} 个讨论线程；${coverage.authorCount} 个已知作者标识；独立样本 ${coverage.independentSamples} 个。同线程或同作者已合并，这些计数不是独立客户数。裁剪正文 ${coverage.truncated} 条。\n${coverage.qualification.map(x=>'- '+x).join('\n')}\n时间过滤：${w.mode==='four'?'本轮未检索，沿用已有资料；请核查原始日期与采集记录':w.since===null?'未使用日期过滤':new Date(w.since*1000).toISOString().slice(0,10)+' 以后'}\n\n${sources}\n\n## 机会与反证\n${w.analysisRun?.report||'未生成分析草稿。'}\n\n## 补证决策\n${w.records.filter(r=>r.stage==='gap').flatMap(r=>r.output?.gaps||[]).map(x=>'- '+x).join('\n')||'本轮未启用自动补证或预算不足。'}${collaborationReport(w)}\n\n## 已知限制与下一步\n${w.limitations.map(x=>'- '+x).join('\n')}\n- 引用标识通过不等于原文支持程度已验证；付款、市场规模及访谈缺口需要另行核查。\n- 本草稿未自动写入人工机会卡或正式报告。\n\n## 证据目录\n${directory}\n`;
}
