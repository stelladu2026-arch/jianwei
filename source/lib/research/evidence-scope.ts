import {sourceCoverage} from './source-coverage';
import type {Evidence} from './domain';

/** Describes saved citation scope only. It never scores semantic support or verifies customers. */
export function summarizeEvidenceScope(sources:readonly unknown[],refs:readonly string[]){
 const requested=[...new Set(refs)],rows:Evidence[]=[];
 for(const value of sources){
  if(!value||typeof value!=='object')continue;
  const s=value as Partial<Evidence>;
  if(s.excluded===true||typeof s.id!=='string'||!requested.includes(s.id)||typeof s.text!=='string'||!s.text.trim()||rows.some(r=>r.id===s.id))continue;
  rows.push({id:s.id,title:typeof s.title==='string'?s.title:'',text:s.text,source:typeof s.source==='string'?s.source:'',date:typeof s.date==='string'?s.date:'',fetched:'',author:typeof s.author==='string'?s.author:'',thread:typeof s.thread==='string'?s.thread:'',url:'',kind:s.kind==='public'?'public':s.kind==='synthetic'?'synthetic':'imported',stance:'context',excluded:false,truncated:s.truncated===true,contentType:s.contentType});
 }
 const unknownRelations=rows.filter(s=>!s.author.trim()&&!s.thread.trim()).length;
 const relatedGroups=rows.length&&!unknownRelations?sourceCoverage(rows).independentSamples:null;
 const truncated=rows.filter(s=>s.truncated).length;
 const showcases=rows.filter(s=>/^show hn\s*:/i.test(s.title.trim())).length;
 const publicOnly=rows.length>0&&rows.every(s=>s.kind==='public');
 const missing=requested.filter(id=>!rows.some(s=>s.id===id));
 const warnings:string[]=[];
 if(!rows.length)warnings.push('尚无可核查的结论引用原文，不能据此确认机会。');
 if(missing.length)warnings.push(`${missing.length} 个引用编号未附本次原文，需核对输入快照。`);
 if(relatedGroups!==null&&relatedGroups<rows.length)warnings.push(`${rows.length} 条原文保守合并为 ${relatedGroups} 个来源关联组，不是多个独立客户。`);
 if(unknownRelations)warnings.push(`${unknownRelations} 条原文缺少作者及线程信息，资料独立性无法判断；不借用当前资料补齐历史身份。`);
 if(showcases)warnings.push(`${showcases} 条标题标注 Show HN，属于项目展示线索，不能直接当作客户需求已验证。`);
 if(truncated)warnings.push(`${truncated} 条原文已裁剪，需核查完整语境。`);
 if(publicOnly)warnings.push('结论引用全部来自公开资料，不能证明真实付费或目标人群代表性。');
 return {requested:requested.length,attached:rows.length,relatedGroups,truncated,showcases,publicOnly,missing,warnings};
}
export function renderEvidenceScope(sources:readonly unknown[],refs:readonly string[]){
 const s=summarizeEvidenceScope(sources,refs);
 return `## 结论引用范围（本地规则）\n已附原文 ${s.attached} / ${s.requested}；来源关联组：${s.relatedGroups===null?'未知':s.relatedGroups}；裁剪片段 ${s.truncated} 条。\n${s.warnings.map(w=>'- '+w).join('\n')}\n这些是范围提示，不是语义支持、客户独立性或商业可行性评分。逐项核查原文是否支持同一人群、问题及因果关系；访谈和付款仍待验证。`;
}
