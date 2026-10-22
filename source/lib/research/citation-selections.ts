import {z} from 'zod';
import type {SourceQuote} from './source-facts';
export const CITATION_SELECTION_FORMAT='citation-selections/1';
// An explicit new wire. The catalog is made only from the immutable current
// model input. Legacy free-text citations are not repaired or substituted.
export function decodeCitationSelections(raw:unknown,catalog:SourceQuote[],diagnose?:(issues:string[])=>void){
 const value=raw as any;
 const hasSelection=value?.data&&Object.hasOwn(value.data,'citation_quote_ids');
 function reject(path:string,code='INVALID_MODEL_OUTPUT'):never{diagnose?.([path]);throw new Error(code)}
 if(value?.citation_format===undefined){if(hasSelection)reject('citation_format:required_for_selection');return raw;}
 if(value.citation_format!==CITATION_SELECTION_FORMAT)reject('citation_format:unknown');
 if(!value.data||typeof value.data!=='object'||Array.isArray(value.data)||Object.hasOwn(value.data,'citations'))reject('data.citations:forbidden_in_selection_format');
 const parsed=z.array(z.string().min(1).max(20)).max(2).safeParse(value.data.citation_quote_ids);
 if(!parsed.success)reject('data.citation_quote_ids:invalid');
 if(new Set(parsed.data).size!==parsed.data.length)reject('data.citation_quote_ids:duplicate');
 const referenced=new Set<string>([...(Array.isArray(value.data.notes)?value.data.notes.flatMap((n:any)=>Array.isArray(n?.refs)?n.refs:catalog.filter(q=>q.id===n?.quote_id).map(q=>q.evidence_id)):[]),...(Array.isArray(value.data.proposal?.refs)?value.data.proposal.refs:[])]);
 const citations=parsed.data.map((id,index)=>{
  const quote=catalog.find(q=>q.id===id);if(!quote)reject('data.citation_quote_ids.'+index+':not_in_input','INVALID_MODEL_REFERENCE');
  if(!referenced.has(quote.evidence_id))reject('data.citation_quote_ids.'+index+':not_in_claim','INVALID_MODEL_REFERENCE');
  return {evidence_id:quote.evidence_id,quote:quote.quote};
 });
 const result=structuredClone(value);delete result.citation_format;delete result.data.citation_quote_ids;result.data.citations=citations;return result;
}
export function citationSelectionInstructions(){return `采用 citation_format=citation-selections/1；所有引文只填写 data.citation_quote_ids，从 source_quote_options 选择最多两个不同 Q 编号，不抄写、翻译或改写引文，不填写 citations。所选片段必须来自 notes 或 proposal 引用的资料；应用将准确附回原文，但原文可定位不代表支持度已核实。fact_format=source-quote/1；fact note 仅填 kind=fact 和 quote_id，程序生成原句和引用；其他 note 填 claim、kind、refs。最多两条 notes，区分假设、缺口与反证，不把归纳写成事实。输出 evidence_ids 应包含所有 refs；协调角色提供有条件的 proposal、反证、未知与可执行计划，demand 仅填写有依据的字段；who、problem、effect、workaround 及 interview.decision_evidence 没有内容就省略，不要填空字符串、空白、null 或编造内容。interview.questions 只能填写真实待问的问题，暂无问题用空数组。公开讨论不能核实实际付款，不虚构客户、市场规模、价格或访谈。工具仅用白名单和对应必要参数，只有需要工具时才填非空 tool_calls；最后一次请求必须用已有资料返回最终结果，缺口保留未知。`;}
