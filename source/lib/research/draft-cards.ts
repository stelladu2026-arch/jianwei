import type {claimKinds} from './claim-kinds';
import type {Evidence} from './domain';
import {retrieveProjectEvidence} from './retrieval';

export type RemarkClass='抱怨'|'口头兴趣'|'未见付款';
export type PaymentSignal='none'|'weak'|'medium';
export type DemandField=string|{text:string;evidence_ids?:string[]};
export type DemandNote={who?:DemandField;problem?:DemandField;effect?:DemandField;workaround?:DemandField;who_refs?:string[];problem_refs?:string[];effect_refs?:string[];workaround_refs?:string[]};
export type InterviewQuestion={question:string;evidence_ids?:string[]};
export type InterviewPlan={questions:InterviewQuestion[];decision_evidence?:string};
export type ConclusionReview={status:'待复核';reason:string};
type Line={text:string;cited:string[]};
type Quote={evidence_id:string;quote:string};

const COMPLAINT=/抱怨|烦|痛苦|讨厌|frustrating|annoyed|annoy|hate|painful|complaint/i;
const VERBAL=/愿意付|想付|如果便宜|would pay|willing to pay|interested in paying|if it were cheaper/i;
const LITERAL_PAY=/已付款|付了款|发票|\$\d|\bpaid\b|\binvoice\b|付款|付费/i;
const LABELS=[['who','谁'],['problem','问题'],['effect','影响'],['workaround','当前变通']] as const;

export function classifyPublicRemark(quote:string):RemarkClass{
  if(VERBAL.test(quote))return '口头兴趣';
  if(COMPLAINT.test(quote))return '抱怨';
  return '未见付款';
}

export function paymentJudgment(model:PaymentSignal,quotes:string[]):'未见付款'|'口头兴趣'{
  const verbal=quotes.some(quote=>VERBAL.test(quote));
  if(!verbal||model==='none')return '未见付款';
  return '口头兴趣';
}

function lineOf(value:DemandField|undefined,extra:string[]|undefined):Line|undefined{
  if(typeof value==='string'&&value.trim())return {text:value.trim(),cited:extra||[]};
  if(value&&typeof value==='object'&&value.text.trim())return {text:value.text.trim(),cited:[...(value.evidence_ids||[]),...(extra||[])]};
  return undefined;
}

function lineIds(line:Line,evidence:Evidence[]){
  const known=new Set(evidence.filter(item=>!item.excluded).map(item=>item.id));
  const cited=line.cited.filter(id=>known.has(id));
  const overlap=retrieveProjectEvidence(evidence,line.text).map(hit=>hit.id);
  return [...new Set([...cited,...overlap])];
}

export function renderDemandCard(demand:DemandNote|undefined,evidence:Evidence[]){
  const body=LABELS.map(([key,label])=>{
    const line=lineOf(demand?.[key],demand?.[`${key}_refs`]);
    if(!line)return `### ${label}\n未提供。`;
    const ids=lineIds(line,evidence);
    const refs=ids.length?` ${ids.map(id=>'['+id+']').join(' ')}（词面重叠或该行已写的资料标识，不是语义检索）`:'';
    return `### ${label}\n${line.text}${refs}`;
  }).join('\n');
  return `## 需求卡\n缺的字段保持未提供。应用没有补写，也没有自动保存机会卡。\n${body}`;
}

export function renderInterviewPlan(interview:InterviewPlan|undefined,evidence:Evidence[]){
  const questions=interview?.questions.filter(item=>item.question.trim())||[];
  const listed=questions.length?questions.map((item,index)=>{
    const ids=lineIds({text:item.question,cited:item.evidence_ids||[]},evidence);
    return `${index+1}. ${item.question.trim()}${ids.length?' '+ids.map(id=>'['+id+']').join(' '):''}`;
  }).join('\n'):'未提供。应用没有编造访谈问题或访谈记录。';
  const changer=interview?.decision_evidence?.trim()||'未提供。';
  return `## 访谈计划\n待问问题：\n${listed}\n会改变决策的证据：${changer}\n这不是访谈记录，也不是市场结论。`;
}

export function renderPublicSignals(quotes:{evidence_id:string;quote:string;located:boolean}[],model:PaymentSignal){
  const located=quotes.filter(item=>item.located);
  const rows=located.length?located.map(item=>`- [${item.evidence_id}] ${classifyPublicRemark(item.quote)}：「${item.quote}」`).join('\n'):'- 没有已定位的公开原句。';
  const judgment=paymentJudgment(model,located.map(item=>item.quote));
  return `## 公开言论\n${rows}\n付款判断：${judgment}。公开原句不能升级为实际付费。模型给出的付费信号是 ${model}；若该信号比上述判断更强，应用仍采用更严的判断。`;
}

export function renderQuoteLayers(notes:{claim:string;refs:string[];kind:typeof claimKinds[number]}[],citations:Quote[]|undefined,evidence:{id:string;text:string}[]){
  const located=(citations||[]).filter(item=>{
    const source=evidence.find(row=>row.id===item.evidence_id);
    return typeof source?.text==='string'&&item.quote.length>0&&source.text.indexOf(item.quote)>=0;
  });
  const claim=(kind:'fact'|'hypothesis'|'gap')=>{
    const rows=notes.filter(note=>note.kind===kind);
    return rows.length?rows.map(note=>`- ${note.claim} ${note.refs.map(id=>'['+id+']').join(' ')}`.trim()).join('\n'):'- 无';
  };
  const quotes=located.length?located.map(item=>`- [${item.evidence_id}] ${item.quote}`).join('\n'):'- 未定位到原句。';
  return `## 来源原句\n来源原句表示代码在资料里定位到了连续切片。定位到的原句不是已核实的市场事实。\n${quotes}\n\n## 资料事实\n仅表示可定位的原文陈述，未独立核实来源或交易。\n${claim('fact')}\n\n## 推断\n推断只收录 kind 为 hypothesis 的主张。\n${claim('hypothesis')}\n\n## 未知\n未知只收录 kind 为 gap 的主张。\n${claim('gap')}`;
}
