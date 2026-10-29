import {saveExperiment} from '@/lib/research/experiment';
import {isStorageFailure,storageFailureMessage} from '@/lib/research/storage-errors';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {get,save,db} from '@/lib/research/store';
import {demoOpportunities,invalidate,log,markCompletedConclusions,report,scopeChangeReason} from '@/lib/research/domain';
import {applyGovernanceAction} from '@/lib/research/governance-actions';
import {scanReflections} from '@/lib/research/governance';
import {invalidateRun} from '@/lib/research/execution';
import {activeWorkflow,controlWorkflow,unfinishedResearch,researchHasLease} from '@/lib/research/workflow';
import {controlRun} from '@/lib/research/execution-controls';
import {saveConfirmedOpportunity,removeOpportunity} from '@/lib/research/opportunity-actions';
const text=z.string().max(8000);
const bodySchema=z.object({version:z.number().int().positive(),callId:z.string().uuid(),action:z.enum(['experiment','brief','confirm','step','pause','resume','cancel','archive','evidence','removeEvidence','import','opportunity','removeOpportunity','report','finish','memory','confirmMemory','removeMemory','reflection','scanReflections','resolveReflection','removeReflection']),data:z.any().optional()});
const imported=z.object({title:z.string().trim().min(1).max(200),text:z.string().trim().min(1).max(8000),source:z.string().trim().min(1).max(200),date:z.string().max(30),author:z.string().max(100).default(''),thread:z.string().max(200).default(''),url:z.string().max(1000).default(''),stance:z.enum(['support','counter','context']).default('context'),applicationNote:z.string().max(500).optional(),sourceState:z.enum(['open','closed']).optional(),contentBasis:z.enum(['full','excerpt']).optional(),truncated:z.boolean().optional(),authorization:z.literal('user-attested')});
export async function GET(_request:Request,ctx:{params:Promise<{id:string}>}){try{const p=await get((await ctx.params).id);return p?NextResponse.json({project:p},{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'项目不存在'},{status:404})}catch(e){return NextResponse.json({error:isStorageFailure(e)?storageFailureMessage(e,false):'读取项目详情失败，请重试。'},{status:503})}}
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){try{
if(req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'请求来源不正确'},{status:403});
const {id}=await ctx.params;const b=bodySchema.parse(await req.json());const p=await get(id);if(!p)return NextResponse.json({error:'项目不存在'},{status:404});if(p.actions.includes(b.callId))return NextResponse.json({project:p});if(p.version!==b.version)throw new Error('VERSION_CONFLICT');const d=b.data;let opportunityId:string|undefined;
if(b.action==='brief'){const v=z.object({title:z.string().trim().min(1).max(100),audience:text,region:text,period:text,exclusions:text,decision:text}).parse(d);const reason=scopeChangeReason(p,v);if(reason)markCompletedConclusions(p,reason);Object.assign(p,v);p.revision++;p.confirmed=false;p.status='draft';p.step=0;p.budget={searches:0,requests:0,modelCalls:0};p.mode='manual';invalidate(p);log(p,reason||'修改研究范围，旧结论已标记待复核');}
if(b.action==='confirm'){if(!p.audience.trim()||!p.decision.trim())throw new Error('请先补充目标人群和预期决策。');p.confirmed=true;p.status='collecting';log(p,'已人工确认研究范围');}
if(b.action==='step'){if(!p.confirmed||['paused','cancelled','completed'].includes(p.status))throw new Error('请先确认范围或恢复研究。');if(p.mode!=='replay')throw new Error('请在“一键研究”开始自动研究，或在“执行与评测”分析已有资料。');p.step=Math.min(4,p.step+1);p.status=['collecting','analyzing','reviewing','awaiting_decision','completed'][p.step];if(p.step===3)p.opportunities=demoOpportunities(p);log(p,['','演示回放：需求角色读取虚构资料','演示回放：替代研究与独立反证检查','演示回放：协调角色汇总条件性判断','演示回放完成；没有真实模型调用'][p.step]);}
if(b.action==='pause'){if(activeWorkflow(p))controlWorkflow(p,'pause');if(!['collecting','analyzing','reviewing','awaiting_decision','partial'].includes(p.status))throw new Error('当前状态不能暂停。');if(p.run&&['ready','running','failed'].includes(p.run.status))controlRun(p,'pause');p.resume=p.status;p.status='paused';log(p,'暂停研究，保留进度');}
if(b.action==='resume'){if(p.status!=='paused')throw new Error('当前没有暂停的研究。');p.status=p.resume||'collecting';log(p,'从保存进度继续');}
if(b.action==='cancel'){if(p.run&&!['completed','cancelled'].includes(p.run.status))controlRun(p,'cancel');if(activeWorkflow(p))controlWorkflow(p,'cancel');p.status='cancelled';log(p,'已取消研究，已有资料保留');}
if(b.action==='archive'){p.archived=!p.archived;log(p,p.archived?'归档项目':'恢复项目');}
if(b.action==='import'){if(p.mode==='replay')throw new Error('演示项目仅保留虚构资料，请新建真实研究项目导入。');if(p.evidence.length>=100)throw new Error('本版每个项目最多 100 条资料。');const rows=z.array(imported).min(1).max(30).parse(d);for(const r of rows){if(p.evidence.length>=100)break;if(r.url&&!/^https?:\/\//i.test(r.url))throw new Error('来源链接只支持 http 或 https。');if(p.evidence.some(e=>e.text.trim()===r.text.trim()&&e.source===r.source))continue;const eid=crypto.randomUUID().slice(0,8);p.evidence.push({...r,id:eid,thread:r.thread||eid,kind:'imported',excluded:false,truncated:r.truncated||false,fetched:new Date().toISOString()});}invalidate(p);log(p,'导入用户声明已获授权的资料；授权声明不是人群或采集方式已核实，旧判断待复核');}
if(b.action==='evidence'){const v=z.object({id:z.string(),excluded:z.boolean(),stance:z.enum(['support','counter','context'])}).parse(d);const e=p.evidence.find(x=>x.id===v.id);if(!e)throw new Error('证据不存在');Object.assign(e,v);invalidate(p);log(p,'更新证据采纳或正反证标记，结论待复核');}
if(b.action==='removeEvidence'){const eid=z.string().parse(d);p.evidence=p.evidence.filter(e=>e.id!==eid);invalidate(p);log(p,'删除资料，关联结论待复核');}
if(b.action==='experiment')saveExperiment(p,d);
if(b.action==='opportunity')opportunityId=saveConfirmedOpportunity(p,d);
if(b.action==='removeOpportunity')removeOpportunity(p,d);
if(b.action==='finish'){if(unfinishedResearch(p))throw new Error('还有研究或结论复核尚未结束，请先完成或结束检查点；已有阶段成果仍可导出。');if(!p.confirmed||!p.opportunities.length||p.opportunities.some(o=>o.status==='draft'||o.stale||!o.plan.trim()))throw new Error('请先确认范围、复核机会判断并补齐验证计划。');p.status='completed';log(p,'人工确认本次研究交付完成；不代表商业机会成立');}
if(b.action==='report'){if(researchHasLease(p))throw new Error('仍有步骤正在执行，请先导出已有阶段成果；步骤结束或恢复检查点后再保存快照。');p.reports.unshift({at:new Date().toISOString(),revision:p.revision,body:report(p)});p.reports=p.reports.slice(0,10);log(p,'保存报告快照');}
applyGovernanceAction(p,b.action,d);
if(['memory','confirmMemory','removeMemory'].includes(b.action)){invalidateRun(p);if(p.workflow&&p.workflow.status!=='cancelled'){p.workflow.status='stale';p.workflow.lease=undefined;}}
if(['brief','import','evidence','removeEvidence','opportunity','removeOpportunity'].includes(b.action))scanReflections(p);
p.actions=[...p.actions.slice(-49),b.callId];return NextResponse.json({project:await save(p,b.version),opportunityId});
}catch(e){const msg=e instanceof Error?e.message:'';return NextResponse.json({error:isStorageFailure(e)?storageFailureMessage(e,true):msg==='VERSION_CONFLICT'?'其他操作已更新项目，请刷新后重试。':e instanceof z.ZodError?'数据格式不正确，请检查输入。':msg||'保存失败，请重试。'},{status:isStorageFailure(e)?503:msg==='VERSION_CONFLICT'?409:400})}}
export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){try{if(req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'请求来源不正确'},{status:403});const {id}=await ctx.params;const v=Number(new URL(req.url).searchParams.get('version'));const r=await db().prepare('DELETE FROM research_projects WHERE id=? AND version=?').bind(id,v).run();if(!r.meta.changes)return NextResponse.json({error:'项目已改变，请刷新后再删除。'},{status:409});return NextResponse.json({ok:true})}catch(e){return NextResponse.json({error:isStorageFailure(e)?storageFailureMessage(e,true):'删除结果暂时无法确认，请先刷新项目检查，再决定是否重试。'},{status:503})}}
