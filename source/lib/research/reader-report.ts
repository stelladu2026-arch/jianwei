import type {Project} from './domain';
import type {ResearchWorkflow} from './workflow';
import {workflowModelUsage} from './workflow-usage';
import {researchClaimWarnings,evidenceQualityReport,validationPlanWarnings} from './evidence-quality';
import {actionParagraphs} from './action-paragraphs';
export function readerWorkflowReport(p:Project,w:ResearchWorkflow,archive:string){
 const proposal=w.analysisRun?.report?w.analysisRun.tasks.find(t=>t.role==='coordinator')?.output?.data.proposal:undefined;
 if(!proposal)return archive;
 const usage=workflowModelUsage(w),refs=new Set(proposal.refs),sources=(w.frozen?.evidence||p.evidence).filter(e=>refs.has(e.id)&&!e.excluded);
 return `# 一键研究草稿：${p.title}\n\n**阅读版：模型判断与公开线索，待人工核查。**\n研究 / 资料版本：${w.revision} / ${w.evidenceVersion}；模型请求 ${usage.attempts}/${usage.limit}，有用量回执 ${usage.receipts} 次；已知输入 / 输出词元 ${usage.input} / ${usage.output}。\n\n## 本轮判断\n${proposal.conclusion}\n\n${researchClaimWarnings(proposal,sources).map(w=>'- 应用规则提示（非语义验证）：'+w).join('\n')}\n\n## 已有替代\n${proposal.alternative}\n\n## 关键引用\n${sources.map(e=>`- [${e.id}] ${e.title} — ${e.url}`).join('\n')||'尚无可附原文，不能据此确认判断。'}\n\n${evidenceQualityReport(sources)}\n## 反证与未知\n反证：${proposal.counter}\n\n未知项：${proposal.unknowns}\n\n## 下一步验证\n${actionParagraphs(proposal.plan).map(t=>t+'\n').join('\n')}\n${validationPlanWarnings(proposal.plan).map(w=>'- 计划检查提示（词面检查，待人工核对）：'+w).join('\n')}\n\n<details>\n<summary>附录：完整执行、分类与原文记录</summary>\n\n${archive}\n\n</details>\n`;
}
