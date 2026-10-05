import {z} from 'zod';
import type {Role} from './model-port';
export const judgments=['supports','partial','insufficient','contradicts'] as const;
export const judgmentLabels={supports:'支持',partial:'部分支持',insufficient:'证据不足',contradicts:'存在矛盾'};
export const targetLabels:Record<string,string>={'proposal:problem':'机会问题','proposal:conclusion':'机会判断'};
export function describeReviewIssue(issue:string){
  const anchor=issue.match(/^data\.checks\.(\d+)\.anchors:required_for_judgment$/);
  if(anchor)return `第 ${Number(anchor[1])+1} 个核查条目给出了支持、部分支持或存在矛盾的判断，却没有附原文片段。该结果已拒绝；重新生成时须附引用，无法找到依据就应标为证据不足。`;
  const quote=issue.match(/^data\.checks\.(\d+)\.anchors\.(\d+)\.quote:not_in_input$/);
  if(quote)return `第 ${Number(quote[1])+1} 个核查条目的第 ${Number(quote[2])+1} 段引文，无法在对应输入原文中逐字定位。`;
  if(issue==='data.checks:claim_count_mismatch')return '主张数量与核查条目数量不一致，有主张未核查或有多余条目。';
  if(issue==='data.checks.target:duplicate')return '同一主张被重复核查，不能覆盖其他主张。';
  if(issue==='data.checks:required')return '模型没有返回逐条核查结果。';
  if(issue==='data.notes:too_many')return '模型返回的笔记超过本轮两条上限。';
  if(issue.endsWith(':not_allowed_for_role'))return '模型返回了当前角色不允许生成的字段。';
  if(issue==='data.disagreements:required_for_coordinator')return '协调角色没有返回约定的分歧核查字段。';
  if(issue.endsWith('.target:unknown_claim'))return '核查条目指向不存在的主张。';
  const reference=issue.match(/^data\.checks\.(\d+)\.anchors\.(\d+)\.evidence_id:not_in_claim$/);
  if(reference)return `第 ${Number(reference[1])+1} 个核查条目的第 ${Number(reference[2])+1} 段引文，使用的资料编号不在该主张的引用中。`;
  return '输出字段未通过检查，具体字段位置见失败详情。';
}
export type ClaimCheck={target:string;judgment:typeof judgments[number];reason:string;anchors:{evidence_id:string;quote:string}[]};
export type LocatedCheck=Omit<ClaimCheck,'anchors'>&{claim:string;anchors:{evidence_id:string;quote:string;start:number;end:number}[]};
export type Disagreement={topic:string;roles:Role[];reason:string;handling:string;refs:string[]};
export const checkSchema=z.object({target:z.string().max(40),judgment:z.enum(judgments),reason:z.string().trim().min(1).max(240),anchors:z.array(z.object({evidence_id:z.string().max(100),quote:z.string().min(12).max(240)}).strict()).max(2)}).strict();
export const disagreementSchema=z.object({topic:z.string().trim().min(1).max(160),roles:z.array(z.enum(['needs','commercial','verifier'])).min(2).max(3),reason:z.string().trim().min(1).max(240),handling:z.string().trim().min(1).max(240),refs:z.array(z.string().max(100)).max(6)}).strict();
