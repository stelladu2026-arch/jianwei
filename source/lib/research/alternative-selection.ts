import type {SourceQuote} from './source-facts';
export const ALTERNATIVE_FORMAT='quote-or-unknown/1';
export const UNKNOWN_ALTERNATIVE='UNKNOWN_ALTERNATIVE';
export const alternativeInstructions='已有替代采用 alternative_format=quote-or-unknown/1。proposal 不填写 alternative 自由文本，只填写 alternative_quote_id：仅选择明确描述同一目标人群正在使用的替代方式的 Q 编号。开发提议、其他行业、产品功能列表或常识不能证明现状；没有这种原句就选择 UNKNOWN_ALTERNATIVE，应用会显示未取得直接证据。不得为了填满报告选无关原句。';
export function bindAlternativeSchema(schema:any,catalog:SourceQuote[]){
 const proposal=schema.properties?.data?.properties?.proposal;
 if(!proposal)return schema;
 delete proposal.properties.alternative;
 proposal.required=proposal.required.filter((key:string)=>key!=='alternative');
 proposal.properties.alternative_quote_id={type:'string',enum:[UNKNOWN_ALTERNATIVE,...catalog.map(q=>q.id)]};
 proposal.required.push('alternative_quote_id');
 schema.properties.alternative_format={type:'string',enum:[ALTERNATIVE_FORMAT]};schema.required.push('alternative_format');
 return schema;
}
// Explicit new wire only; historical free-text outputs are never rewritten.
export function decodeAlternativeSelection(raw:any,catalog:SourceQuote[],requireSelection=false){
 const proposal=raw?.data?.proposal;
 if(requireSelection&&proposal&&raw?.alternative_format===undefined)throw Error('INVALID_MODEL_OUTPUT');
 if(raw?.alternative_format===undefined){if(proposal&&Object.hasOwn(proposal,'alternative_quote_id'))throw Error('INVALID_MODEL_OUTPUT');return {value:raw,ref:undefined};}
 if(raw.alternative_format!==ALTERNATIVE_FORMAT||!proposal||typeof proposal!=='object'||Array.isArray(proposal)||Object.hasOwn(proposal,'alternative'))throw Error('INVALID_MODEL_OUTPUT');
 const id=proposal.alternative_quote_id,quote=catalog.find(q=>q.id===id);
 if(id!==UNKNOWN_ALTERNATIVE&&!quote)throw Error('INVALID_MODEL_REFERENCE');
 const value=structuredClone(raw),p=value.data.proposal;delete value.alternative_format;delete p.alternative_quote_id;
 p.alternative=quote?`来源自述 [${quote.evidence_id}]（目标场景适用性待核查）：${quote.quote}`:'本轮未取得目标人群现有替代方案的直接证据。';
 if(quote){if(Array.isArray(p.refs))p.refs=[...new Set([...p.refs,quote.evidence_id])];if(Array.isArray(value.evidence_ids))value.evidence_ids=[...new Set([...value.evidence_ids,quote.evidence_id])];}
 return {value,ref:quote?.evidence_id};
}
