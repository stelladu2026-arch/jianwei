import type {SourceQuote} from './source-facts';
export const PROPOSAL_BASIS_FORMAT='proposal-basis/1';
export const basisFields=['problem','conclusion','counter'] as const;
export type ProposalBasis=Record<typeof basisFields[number],{evidence_id:string;quote:string}[]>;
export const proposalBasisInstructions='单角色协调报告采用 proposal_basis_format=proposal-basis/1，proposal.basis_quote_ids 分别为 problem、conclusion、counter 选择最多两个 source_quote_options 中的 Q 编号；每项只选支持该字段实际语句的片段，无依据用空数组。不得用统一 refs 代替分项依据。提到官方文档或版本记录时，必须在对应字段选该原文；引用可定位仍不代表语义支持。';
export function bindProposalBasisSchema(schema:any,catalog:SourceQuote[]){
 const proposal=schema.properties?.data?.properties?.proposal;if(!proposal)return schema;
 const items={type:'string',enum:catalog.length?catalog.map(q=>q.id):['NO_AVAILABLE_QUOTE']};
 proposal.properties.basis_quote_ids={type:'object',additionalProperties:false,properties:Object.fromEntries(basisFields.map(field=>[field,{type:'array',maxItems:catalog.length?2:0,items}])),required:[...basisFields]};
 proposal.required.push('basis_quote_ids');schema.properties.proposal_basis_format={type:'string',enum:[PROPOSAL_BASIS_FORMAT]};schema.required.push('proposal_basis_format');return schema;
}
// New transport only. Historical reports stay unmodified; callers explicitly
// require this marker for new single-role coordinator responses.
export function decodeProposalBasis(raw:any,catalog:SourceQuote[],required=false){
 const proposal=raw?.data?.proposal;
 if(raw?.proposal_basis_format===undefined){if(proposal&&(required||Object.hasOwn(proposal,'basis_quote_ids')))throw Error('INVALID_MODEL_OUTPUT');return raw;}
 if(raw.proposal_basis_format!==PROPOSAL_BASIS_FORMAT||!proposal||typeof proposal!=='object'||Array.isArray(proposal)||Object.hasOwn(proposal,'basis'))throw Error('INVALID_MODEL_OUTPUT');
 const selected=proposal.basis_quote_ids;
 if(!selected||typeof selected!=='object'||Array.isArray(selected)||Object.keys(selected).length!==3||Object.keys(selected).some(k=>!basisFields.includes(k as any)))throw Error('INVALID_MODEL_OUTPUT');
 const basis={} as ProposalBasis;
 for(const field of basisFields){const ids=selected[field];if(!Array.isArray(ids)||ids.length>2||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw Error('INVALID_MODEL_OUTPUT');basis[field]=ids.map(id=>{const q=catalog.find(q=>q.id===id);if(!q)throw Error('INVALID_MODEL_REFERENCE');return {evidence_id:q.evidence_id,quote:q.quote};});}
 const value=structuredClone(raw),p=value.data.proposal;delete value.proposal_basis_format;delete p.basis_quote_ids;p.basis=basis;
 const refs=Object.values(basis).flatMap(rows=>rows.map(row=>row.evidence_id));
 if(Array.isArray(p.refs))p.refs=[...new Set([...p.refs,...refs])];if(Array.isArray(value.evidence_ids))value.evidence_ids=[...new Set([...value.evidence_ids,...refs])];return value;
}
export function renderProposalBasis(basis?:ProposalBasis){
 const labels={problem:'问题假设',conclusion:'本轮判断',counter:'反证'};
 return '## 分项依据\n原句由应用按模型所选编号附回；可定位不等于语义支持、适用性或事实已核实。\n'+(basis?basisFields.map(field=>'### '+labels[field]+'\n'+(basis[field].length?basis[field].map(row=>`- [${row.evidence_id}] ${row.quote}`).join('\n'):'未选择对应原文，不能将该字段当作有直接证据的判断。')).join('\n'):'本结果未记录此格式的分项依据；四角色结果另看原有主张核查，旧结果保持原样。不能把统一引用列表当作每项主张均有支持。')+'\n';
}
