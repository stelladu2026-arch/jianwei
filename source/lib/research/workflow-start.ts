import {isAnalysisBody} from './evidence-eligibility';
import type {Project} from './domain';
import type {SourceProfile} from './domestic-sources';

export type StartAction='brief'|'new'|'execution'|'checkpoint'|'audit'|'four'|'sources'|'provider';
export type StartBlocker={code:string;message:string;action:StartAction;label:string};
export function collectionStartBlocker(p:Project,profile:SourceProfile):StartBlocker|null{
 const reserved=profile==='v2ex'?1:3;
 if(p.budget.searches+reserved>6)return {code:'collection_budget',message:`本项目累计采集 ${p.budget.searches} / 6 次；所选自动检索需预留最多 ${reserved} 次，剩余次数不足。结束旧轮不会清零项目累计用量。可复核已有资料，或沿用范围新建研究并重新确认。`,action:'four',label:'切换为已有资料复核'};
 if(p.evidence.length>70)return {code:'collection_capacity',message:`本项目已保存 ${p.evidence.length} 条资料，剩余空间不足以开始自动采集。可复核已有资料，或沿用范围新建研究。`,action:'four',label:'切换为已有资料复核'};
 return null;
}
export function researchBriefFromProject(p:Project){return {title:p.title,audience:p.audience,region:p.region,period:p.period,exclusions:p.exclusions,decision:p.decision};}
export function workflowStartBlockers(p:Project,options:{mode:'single'|'four';sourceProfile:SourceProfile;busy:boolean;working:boolean;providerLoading:boolean;providerReady:boolean;providerError:string;restartFour?:boolean}):StartBlocker[]{
 const rows:StartBlocker[]=[];
 if(options.busy||options.working)rows.push({code:'busy',message:'当前操作尚未完成，请等待结束后再开始。',action:'checkpoint',label:'查看研究检查点'});
 if(p.archived||['paused','cancelled','completed'].includes(p.status))rows.push({code:'project_state',message:p.archived?'项目已归档，请先恢复项目。':'项目已暂停、结束或完成，请先在项目上方恢复或重新开启研究。',action:'brief',label:'查看项目状态'});
 if(!p.confirmed)rows.push({code:'scope',message:'请先确认当前研究范围。',action:'brief',label:'去确认研究范围'});
 if(p.mode!=='manual'||p.evidence.some(e=>e.kind==='synthetic'))rows.push({code:'synthetic',message:'当前包含虚构演示资料，请新建真实研究。',action:'new',label:'新建真实研究'});
 if(p.run&&['ready','running','paused','failed'].includes(p.run.status))rows.push({code:'manual_active',message:'执行与评测中仍有未结束任务，请先完成或结束该任务。',action:'execution',label:'处理执行与评测任务'});
 if(p.workflow?.conclusionAudit&&['ready','running'].includes(p.workflow.conclusionAudit.status))rows.push({code:'audit_active',message:'结论复核尚未结束，请先完成或结束复核。',action:'audit',label:'前往结论复核'});
 if(p.workflow&&['ready','running','paused','failed'].includes(p.workflow.status)&&!(options.restartFour&&p.workflow.mode==='four'&&p.workflow.status==='failed'))rows.push({code:'workflow_active',message:'当前研究检查点尚未结束，先处理当前轮再创建新轮。',action:'checkpoint',label:'处理当前研究检查点'});
 if(options.mode==='single'){const collection=collectionStartBlocker(p,options.sourceProfile);if(collection)rows.push(collection);}
 if(options.mode==='four'&&!p.evidence.some(e=>isAnalysisBody(e)))rows.push({code:'originals',message:'至少需要一条可分析的真实正文；只有标题、已排除或虚构资料不能启动复核。',action:'sources',label:'去补充原文'});
 if(options.providerLoading)rows.push({code:'provider_loading',message:'正在读取研究服务状态，请等待完成。',action:'provider',label:'刷新服务状态'});
 else if(options.providerError||!options.providerReady)rows.push({code:'provider',message:options.providerError||'研究服务暂不可用，请刷新服务状态后重试。',action:'provider',label:'刷新服务状态'});
 return rows;
}
