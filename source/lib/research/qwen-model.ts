import {bindProposalBasisSchema,decodeProposalBasis,proposalBasisInstructions} from './proposal-basis';
import {ALTERNATIVE_FORMAT,alternativeInstructions,bindAlternativeSchema,decodeAlternativeSelection} from './alternative-selection';
import {qualityInstructions,evidenceUseHint} from './evidence-quality';
import {CITATION_SELECTION_FORMAT,decodeCitationSelections,citationSelectionInstructions} from './citation-selections';
import {providerSchemaIssues,providerErrorIssues} from './qwen-schema';
import {providerNetworkIssue} from './provider-network';
import {selectionReviewSchema,selectionReviewInstructions,decodeSelectionReview,isSelectionReviewFormat} from './review-selections';
import {FACT_FORMAT,sourceQuoteCatalog,expandSourceFacts} from './source-facts';
import {AUDIT_FORMAT,decodeAuditWire} from './conclusion-audit';
import {claimKinds} from './claim-kinds';
import type {ModelResult,ModelTask,ResearchModelAdapter,Role} from './model-port';
import {externalDataRule,roleRules,researchLanguageRule} from './model-port';
import {decodeReviewWire,REVIEW_FORMAT} from './review-wire';
import {QWEN_BASE_URL,QWEN_MAX_OUTPUT_TOKENS,QWEN_MODEL} from './provider-config';
import {AGENT_TOOLS,AgentToolCalls,parseToolCalls,type AgentToolCall} from './agent-loop';
import {omitBlankOptionalOutput} from './optional-output';

export type Receipt={usage?:{input_tokens:number;output_tokens:number};requestId?:string;outputIssues?:string[];normalizations?:string[]};
export class ProviderError extends Error{
  receipt:Receipt;
  constructor(code:string,receipt:Receipt={}){super(code);this.receipt=receipt;}
}
const planningRules={
 search_plan:'检索词必须同时保留目标人群或产品对象与具体业务动作，例如 freelance overdue invoice、外包 回款；gaps、issues、follow-up 等泛词不能替代业务动作。至少一条检索词明确包含目标人群；不要只用 SaaS 或 AI 泛词。优先找目标角色的经历，开发任务只作方案背景，覆盖不到时说明缺口。你负责把模糊的研究方向写成结构化研究问题，再给出中英文检索词；研究国内人群时，优先一条中文短词和一条英文短词。data.framing 必须包含 target_user、scenario，以及 1 至 3 条 research questions。data.notes 只包含 1 至 2 条检索词，每条 claim 为 2 至 100 字符、仅 1 至 3 个中文或英文关键词（例如 customer support、help desk），不得用长句或堆叠人群及修饰词，refs 为空数组，kind 为 gap。同一检索词会搜索中国新闻网公开报道、GitHub Issues、Hacker News、中文维基百科，并筛选少数派、博客园与 OSCHINA 的近期公开订阅。中文关键词优先国家统计局相关报告，英文关键词保留 Hacker News 评论采集。中国新闻网支持关键词搜索；订阅不是全站历史检索，搜索摘要和订阅摘要都不等于全文，百科、新闻和企业宣传不是客户需求原话。需要工具预检时优先使用 public_source_search；单站检索不能视作完成多渠道采集。tool_calls 最多 2 个，只能使用白名单工具；不需要工具时为空数组。不得生成 URL、市场结论，也不得把主张标成事实或观察。用不同角度覆盖具体痛点、已有替代或反例。status 为 ok，evidence_ids 为空数组；gaps 可说明来源、人群或地域覆盖限制。',
 gap_plan:'你负责判断当前研究缺口是否能通过额外一次公开检索改善。公开搜索覆盖 GitHub Issues、Hacker News、中文维基百科和中文公开订阅，不能验证个人付款承诺、真实账单、访谈和地域代表性。若缺口属于这些不可检索项或不需要补搜，status 为 ok，data.notes 仅一条 claim=STOP、refs=[]、kind=gap，tool_calls 为空数组。若存在可检索缺口且能改变判断，status 为 partial，data.notes 仅一条 claim 为 2 至 100 字符、仅 1 至 3 个中文或英文关键词的检索词、refs=[]、kind=gap，必须不同于此前的检索词；也可以在 tool_calls 里请求一次白名单检索。gaps 简述此检索可以补什么及不能验证什么。不得编造新证据，不得把主张标成事实或观察。'
} as const;
const string={type:'string'};
function object(properties:Record<string,unknown>,required=Object.keys(properties)){return {type:'object',properties,required,additionalProperties:false};}
function emptyIdList(){return {type:'array',maxItems:0,items:{type:'string'}};}
// Planning shares the needs role with analysis, so the provider schema must
// not reuse the 1–10 note analysis contract. Keyword script and word count
// stay in planningQueries, which records a field path instead of a bare code.
export function toolCallSchema(){
  return {type:'array',maxItems:2,items:{anyOf:AGENT_TOOLS.map(name=>object({name:{type:'string',enum:[name]},arguments:name==='hacker_news_read'?object({id:{type:'string',minLength:1,maxLength:12,pattern:'^[0-9]{1,12}$'}}):object({query:{type:'string',minLength:2,maxLength:160}})}))}};
}
function noteSchema(claim:unknown,refs:unknown,review:boolean,evidence?:ModelTask['evidence'],ids?:readonly string[]){
  const extra=review?{}:{refs};
  const nonfact=object({claim,...extra,kind:{type:'string',enum:claimKinds.filter(k=>k!=='fact')}});
  const catalog=evidence?sourceQuoteCatalog(evidence,quoteChoices,ids):[];
  return catalog.length?{anyOf:[nonfact,object({quote_id:{type:'string',enum:catalog.map(q=>q.id)},kind:{type:'string',enum:['fact']}})]}:nonfact;
}

function planningResponseSchema(purpose:'search_plan'|'gap_plan',allowTools=true){
  const claim={type:'string',minLength:2,maxLength:100,pattern:'^[A-Za-z\\u3400-\\u9FFF][A-Za-z0-9\\u3400-\\u9FFF-]*( [A-Za-z0-9\\u3400-\\u9FFF][A-Za-z0-9\\u3400-\\u9FFF-]*){0,2}$'};
  const note=object({claim,refs:emptyIdList(),kind:{type:'string',enum:['gap']}});
  const notes={type:'array',minItems:1,maxItems:purpose==='search_plan'?2:1,items:note};
  const data=purpose==='search_plan'?object({notes,framing:object({target_user:{type:'string',minLength:1,maxLength:200},scenario:{type:'string',minLength:1,maxLength:500},questions:{type:'array',minItems:1,maxItems:3,items:{type:'string',minLength:1,maxLength:200}}})}):object({notes});
  return object({status:{type:'string',enum:purpose==='search_plan'?['ok']:['ok','partial']},data,evidence_ids:emptyIdList(),gaps:{type:'array',maxItems:20,items:{type:'string',maxLength:2000}},tool_calls:allowTools?toolCallSchema():{type:'array',maxItems:0,items:{type:'object'}}});
}
// Choices are literal slices of the frozen input, including original punctuation.
// Constrain provider decoding without repairing or accepting a nonliteral quote.
export function quoteChoices(evidence:ModelTask['evidence']){
  const choices:string[]=[];
  for(const item of evidence){
    const text=typeof (item as {text?:unknown}).text==='string'?(item as {text:string}).text:'';
    let start=0;
    while(start<text.length){
      while(start<text.length&&/\s/.test(text[start]))start++;
      if(start>=text.length)break;
      let end=Math.min(start+160,text.length);
      if(end<text.length){const window=text.slice(start,end),sentence=[...window.matchAll(/[.!?]\s/g)].at(-1);if(sentence&&sentence.index!+1>=12)end=start+sentence.index!+1;else{const space=window.search(/\s+\S*$/);if(space>=12)end=start+space;}}
      while(end>start&&/\s/.test(text[end-1]))end--;
      if(end-start>=12)choices.push(text.slice(start,end));
      else if(text.length>=12)choices.push(text.slice(Math.max(0,text.length-160)));
      start=Math.max(end,start+1);
    }
  }
  return [...new Set(choices)];
}
// Exact length plus one contains clause per value rejects duplicates.
// contains and allOf are draft-07. prefixItems and tuple items stay unused.
// locateChecks still rejects the same output if a provider ignores the keyword.
function containsTarget(target:string){return {contains:{type:'object',properties:{target:{type:'string',enum:[target]}},required:['target']}};}
function uniqueStrings(values:readonly string[]){return {type:'array',minItems:values.length,maxItems:values.length,items:{type:'string',enum:[...values]},allOf:values.map(value=>({contains:{type:'string',enum:[value]}}))};}
export function auditResponseSchema(task:ModelTask){
 const targets=task.review_claims||[];
 const bound=task.evidence.flatMap(item=>{const id=(item as {id:string}).id,q=quoteChoices([item]);return task.evidence_ids.includes(id)&&q.length?[{id,schema:object({evidence_id:{type:'string',enum:[id]},quote:{type:'string',enum:q,minLength:12,maxLength:240}})}]:[]});
 const branch=(target:string,labels:string[],min:number,anchors:typeof bound)=>object({target:{type:'string',enum:[target]},judgment:{type:'string',enum:labels},reason:{type:'string',minLength:1,maxLength:160},anchors:{type:'array',minItems:min,maxItems:2,items:anchors.length?{anyOf:anchors.map(a=>a.schema)}:object({evidence_id:string,quote:string}),...(!anchors.length?{maxItems:0}:{})}});
 const checks={type:'array',minItems:targets.length,maxItems:targets.length,items:{anyOf:targets.flatMap(t=>{const supporting=bound.filter(a=>t.refs.includes(a.id));return [branch(t.target,['insufficient'],0,bound),...(bound.length?[branch(t.target,['contradicts'],1,bound)]:[]),...(supporting.length?[branch(t.target,['supports','partial'],1,supporting)]:[])];})}};
 return object({review_format:{type:'string',enum:[AUDIT_FORMAT]},status:{type:'string',enum:['ok','partial']},data:object({checks}),gaps:{type:'array',maxItems:20,items:{type:'string',maxLength:2000}}});
}
const auditRules='你是结论反证复核角色。review_claims 是四个角色的完整待核查主张，包含协调角色的问题与结论；逐项核查，每个 target 恰好一次，不得漏项、重复或改写主张。对照本次冻结原文，区分支持、部分支持、证据不足和矛盾。支持或部分支持只能引用该主张原来的 refs；反证可以引用其他本次 evidence_ids，但必须逐字选该资料对应的 quote.enum。判断不是人工已验证事实；公开抱怨、兴趣和自述不证明实际付款。insufficient 可无引文，其余必须附可定位片段，reason 最多160字符。不得输出新笔记、机会卡、工具调用、记忆或实际付费认定；不把角色一致当作证据。只输出结论核查契约。';
export function legacyResponseSchema(role:Role,allowedIds?:readonly string[],review=false,quotes?:readonly string[],evidence?:ModelTask['evidence'],purpose?:ModelTask['purpose'],allowTools=true){
  if(purpose==='search_plan'||purpose==='gap_plan')return planningResponseSchema(purpose,allowTools);
  const refs=allowedIds?allowedIds.length?{type:'array',items:{type:'string',enum:[...new Set(allowedIds)]},maxItems:30}:{type:'array',items:{type:'string'},maxItems:0}:{type:'array',items:{type:'string'},maxItems:30};
  // Review text limits match decodeReviewWire. Selected facts reserve space inside the unchanged four-citation limit.
  const claim={type:'string',minLength:1,maxLength:2000};
  const note=noteSchema(claim,refs,review,evidence,allowedIds);
  const proposalFields={title:claim,problem:claim,audience:claim,alternative:claim,conclusion:claim,decision:{type:'string',enum:['validate','evidence','pause']},payment:{type:'string',enum:['none','weak','medium']},...(review?{}:{refs}),counter:claim,unknowns:claim,plan:claim};
  if(!review){
    const selectedFacts=!!evidence&&sourceQuoteCatalog(evidence,quoteChoices,allowedIds).length>0;
    const properties:Record<string,unknown>={notes:{type:'array',items:note,minItems:1,maxItems:selectedFacts?2:10}};
    if(role==='coordinator'){
      const lineRefs=allowedIds?.length?{type:'array',maxItems:8,items:{type:'string',enum:[...new Set(allowedIds)]}}:{type:'array',maxItems:8,items:{type:'string'}};
      const demandFields={who:claim,problem:claim,effect:claim,workaround:claim,who_refs:lineRefs,problem_refs:lineRefs,effect_refs:lineRefs,workaround_refs:lineRefs};
      const question=object({question:claim,evidence_ids:lineRefs},['question']);
      properties.proposal=object({...proposalFields,demand:object(demandFields,[]),interview:object({questions:{type:'array',maxItems:8,items:question},decision_evidence:claim},['questions'])},[...Object.keys(proposalFields),'demand']);
    }
    properties.citations={type:'array',maxItems:selectedFacts?2:4,items:object({evidence_id:allowedIds?.length?{type:'string',enum:[...allowedIds]}:string,quote:{type:'string',minLength:12,maxLength:240}})};
    return object({fact_format:{type:'string',enum:[FACT_FORMAT]},status:{type:'string',enum:['ok','partial']},data:object(properties),evidence_ids:refs,gaps:{type:'array',items:string},tool_calls:allowTools?toolCallSchema():{...toolCallSchema(),maxItems:0}},['status','data','evidence_ids','gaps','tool_calls',...(evidence&&sourceQuoteCatalog(evidence,quoteChoices,allowedIds).length?['fact_format']:[])]);
  }
  // Each anchor may cite only slices of its own evidence item. A pooled quote
  // enum lets the provider pair another item's sentence with this evidence_id.
  const bound=evidence?evidence.flatMap(item=>{
    const id=typeof (item as {id?:unknown}).id==='string'?(item as {id:string}).id:'';
    if(!id||(allowedIds?.length&&!allowedIds.includes(id)))return [];
    const itemQuotes=quoteChoices([item]);
    return itemQuotes.length?[object({evidence_id:{type:'string',enum:[id],maxLength:100},quote:{type:'string',enum:itemQuotes,minLength:12,maxLength:240}})]:[];
  }):[];
  const anchor=bound.length?{anyOf:bound}:object({evidence_id:allowedIds?.length?{type:'string',enum:[...new Set(allowedIds)],maxLength:100}:{type:'string',maxLength:100},quote:quotes?.length?{type:'string',enum:[...quotes],minLength:12,maxLength:240}:{type:'string',minLength:12,maxLength:240}});
  const supportsAllowed=!!bound.length||!evidence;
  const disagreementRefs=allowedIds?.length?{type:'array',maxItems:6,items:{type:'string',enum:[...new Set(allowedIds)],maxLength:100}}:{type:'array',maxItems:6,items:{type:'string',maxLength:100}};
  // One-note and two-note payloads are separate branches so note:1 cannot be
  // emitted for a single note, and the check count must match the claims.
  const reviewData=(noteCount:1|2)=>{
    const targets=[...Array.from({length:noteCount},(_,i)=>'note:'+i),...(role==='coordinator'?['proposal:problem','proposal:conclusion']:[])];
    const check=(judgments:string[],minAnchors:number)=>object({target:{type:'string',enum:targets},judgment:{type:'string',enum:judgments},reason:{type:'string',minLength:1,maxLength:240},anchors:{type:'array',minItems:minAnchors,maxItems:2,items:anchor}});
    const selectedFactCheck=object({target:{type:'string',enum:targets.filter(t=>t.startsWith('note:'))},judgment:{type:'string',enum:['supports']},reason:{type:'string',minLength:1,maxLength:240}});
    const catalog=evidence?sourceQuoteCatalog(evidence,quoteChoices,allowedIds):[];
    const checks:Record<string,unknown>={type:'array',minItems:targets.length,maxItems:targets.length,items:supportsAllowed?{anyOf:[check(['supports','partial','contradicts'],1),check(['insufficient'],0),...(catalog.length?[selectedFactCheck]:[])]}:check(['insufficient'],0)};
    if(targets.length>1)checks.allOf=targets.map(containsTarget);
    const properties:Record<string,unknown>={notes:{type:'array',items:note,minItems:noteCount,maxItems:noteCount},checks};
    if(role==='coordinator'){
      const disagreementRoles={anyOf:[['needs','commercial'],['needs','verifier'],['commercial','verifier'],['needs','commercial','verifier']].map(uniqueStrings)};
      properties.proposal=object(proposalFields);
      properties.disagreements={type:'array',maxItems:2,items:object({topic:{type:'string',minLength:1,maxLength:160},roles:disagreementRoles,reason:{type:'string',minLength:1,maxLength:240},handling:{type:'string',minLength:1,maxLength:240},refs:disagreementRefs})};
    }
    return object(properties);
  };
  return object({fact_format:{type:'string',enum:[FACT_FORMAT]},review_format:{type:'string',enum:[REVIEW_FORMAT]},status:{type:'string',enum:['ok','partial']},data:{anyOf:[reviewData(1),reviewData(2)]},gaps:{type:'array',maxItems:20,items:{type:'string',maxLength:2000}}},['review_format','status','data','gaps',...(evidence&&sourceQuoteCatalog(evidence,quoteChoices,allowedIds).length?['fact_format']:[])]);
}
export function responseSchema(role:Role,allowedIds?:readonly string[],review=false,quotes?:readonly string[],evidence?:ModelTask['evidence'],purpose?:ModelTask['purpose'],allowTools=true){
 if(review&&!purpose)return selectionReviewSchema(role,sourceQuoteCatalog(evidence||[],quoteChoices,allowedIds),allowedIds||[]);
 return legacyResponseSchema(role,allowedIds,review,quotes,evidence,purpose,allowTools);
}
export function singleCitationResponseSchema(role:Role,allowedIds:readonly string[],evidence:ModelTask['evidence'],allowTools=true){
 const schema=legacyResponseSchema(role,allowedIds,false,undefined,evidence,undefined,allowTools) as any;
 const data=schema.properties.data,catalog=sourceQuoteCatalog(evidence,quoteChoices,allowedIds);
 delete data.properties.citations;data.required=data.required.filter((key:string)=>key!=='citations');
 data.properties.citation_quote_ids={type:'array',maxItems:catalog.length?2:0,items:{type:'string',enum:catalog.length?catalog.map(q=>q.id):['NO_AVAILABLE_QUOTE']}};
 data.required.push('citation_quote_ids');schema.properties.citation_format={type:'string',enum:[CITATION_SELECTION_FORMAT]};schema.required.push('citation_format');return schema;
}
// Task-specific instructions share a transport, not each other's output contracts.
export function researchSystemInstructions(task:ModelTask,schema:unknown){
 const format=`只返回符合以下 JSON Schema 的 JSON：${JSON.stringify(schema)}`;
 const prefix=researchLanguageRule+' '+externalDataRule;
 if(task.purpose==='search_plan'||task.purpose==='gap_plan')return prefix+' '+planningRules[task.purpose]+' '+format;
 if(task.purpose==='conclusion_review')return prefix+' '+auditRules+' '+format;
 const concise='只给一个候选机会，每项文本用一至两句说明；notes 最多两条，gaps 最多三条。保留必要引用、反证及未知，不重复资料全文。验证计划写清对象、动作、指标与继续或停止条件。';
 const hints='资料用途提示（规则提示）：'+JSON.stringify(task.evidence.map(evidenceUseHint));
 const contract=task.review?selectionReviewInstructions(task.role,schema):`你是产品机会研究的${task.role}角色。${roleRules[task.role]} ${citationSelectionInstructions()} ${task.allow_tools===false?'这是固定资料分析，tool_calls 必须为 []，不得请求工具。':''} ${format}`;
 return prefix+' '+concise+' '+qualityInstructions+' '+hints+' '+contract+(task.role==='coordinator'?' '+alternativeInstructions:'')+(task.role==='coordinator'&&!task.review?' '+proposalBasisInstructions:'');
}
// There is exactly one HTTP request per execute. No automatic retry or provider fallback.
export class QwenModel implements ResearchModelAdapter{
  receipt:Receipt={};
  constructor(privateKey:string,fetcher:typeof fetch=fetch){this.key=privateKey;this.fetcher=fetcher;}
  private key:string;
  private fetcher:typeof fetch;
  async execute(task:ModelTask,signal:AbortSignal):Promise<ModelResult>{
    this.receipt={};const catalog=sourceQuoteCatalog(task.evidence,quoteChoices,task.evidence_ids);let response:Response;const schema=task.purpose==='conclusion_review'?auditResponseSchema(task):!task.review&&!task.purpose?singleCitationResponseSchema(task.role,task.evidence_ids,task.evidence,task.allow_tools!==false):responseSchema(task.role,task.evidence_ids,!!task.review,undefined,task.evidence,task.purpose,task.allow_tools!==false);
    if(task.role==='coordinator'&&!task.purpose)bindAlternativeSchema(schema,catalog);
    if(task.role==='coordinator'&&!task.purpose&&!task.review)bindProposalBasisSchema(schema,catalog);
    const schemaIssues=providerSchemaIssues(schema);if(schemaIssues.length){this.receipt.outputIssues=schemaIssues;throw new ProviderError('PROVIDER_SCHEMA_UNSUPPORTED',this.receipt);}
    try{response=await this.fetcher(QWEN_BASE_URL+'/chat/completions',{method:'POST',redirect:'manual',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.key},body:JSON.stringify({model:QWEN_MODEL,stream:false,enable_thinking:false,max_tokens:QWEN_MAX_OUTPUT_TOKENS,temperature:0.2,response_format:{type:'json_schema',json_schema:{name:(task.review?'review_v8_':'research_')+(task.purpose||task.role),strict:true,schema:schema}},messages:[{role:'system',content:researchSystemInstructions(task,schema)},{role:'user',content:JSON.stringify({...task,...(!task.purpose&&catalog.length?{source_quote_options:catalog}:{})})}]})});}
    catch(error){
      this.receipt.outputIssues=[providerNetworkIssue(error,signal.aborted)];
      // Safe structured server diagnostics; no raw error or request data.
      console.warn('[jianwei-provider-transport]',JSON.stringify({issues:this.receipt.outputIssues}));
      throw new ProviderError(signal.aborted?'MODEL_TIMEOUT':'PROVIDER_NETWORK_ERROR',this.receipt);
    }
    // Manual handling works in the hosted runtime and never forwards credentials.
    if(response.status>=300&&response.status<400)throw new ProviderError('PROVIDER_REDIRECT_REJECTED');
    const headerId=response.headers.get('x-request-id');
    if(headerId&&/^[\w-]{1,100}$/.test(headerId))this.receipt.requestId=headerId;
    if(!response.ok){
      let quota=false;
      // Preserve fixed-vocabulary diagnostics only; provider text is discarded.
      try{const body=await response.json() as {code?:string;error?:{code?:string}};quota=response.status===403&&(body.error?.code||body.code)==='AllocationQuota.FreeTierOnly';this.receipt.outputIssues=providerErrorIssues(response.status,body);}catch{this.receipt.outputIssues=['provider.http:'+response.status];}
      throw new ProviderError(quota?'FREE_QUOTA_EXHAUSTED':response.status===401?'PROVIDER_AUTH_ERROR':response.status===403?'PROVIDER_FORBIDDEN':response.status===429?'PROVIDER_RATE_LIMIT':response.status===400||response.status===404?'PROVIDER_CONFIG_ERROR':'PROVIDER_UNAVAILABLE',this.receipt);
    }
    let raw:any;try{raw=await response.json();}catch{throw new ProviderError('INVALID_PROVIDER_RESPONSE',this.receipt);}
    const input=raw?.usage?.prompt_tokens,output=raw?.usage?.completion_tokens;
    if(Number.isInteger(input)&&input>=0&&input<=100000&&Number.isInteger(output)&&output>=0&&output<=100000)this.receipt.usage={input_tokens:input,output_tokens:output};
    const choice=raw?.choices?.[0];
    if(choice?.finish_reason==='length')throw new ProviderError('MODEL_OUTPUT_TRUNCATED',this.receipt);
    if(choice?.finish_reason!=='stop'||typeof choice?.message?.content!=='string'||!this.receipt.usage)throw new ProviderError('INVALID_PROVIDER_RESPONSE',this.receipt);
    let parsed:any;try{parsed=JSON.parse(choice.message.content);}catch{this.receipt.outputIssues=['root:invalid_json'];throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
    let alternativeRef:string|undefined;
    try{const selected=parsed?.alternative_format===ALTERNATIVE_FORMAT;const alternative=decodeAlternativeSelection(parsed,catalog,task.role==='coordinator'&&!task.purpose);parsed=alternative.value;alternativeRef=alternative.ref;if(selected)this.receipt.normalizations=[alternativeRef?'alternative_quote_expanded':'alternative_unknown_preserved'];}catch(error){this.receipt.outputIssues=['data.proposal.alternative_quote_id:invalid_selection'];throw new ProviderError((error as Error).message,this.receipt);}
    if(!task.review&&!task.purpose&&task.role==='coordinator'){try{parsed=decodeProposalBasis(parsed,catalog,true);}catch(error){this.receipt.outputIssues=['data.proposal.basis_quote_ids:invalid_selection'];throw new ProviderError((error as Error).message,this.receipt);}}
    const optional=omitBlankOptionalOutput(parsed);parsed=optional.value;
    if(optional.normalizations.length)this.receipt.normalizations=[...(this.receipt.normalizations||[]),...optional.normalizations];
    if(task.purpose==='conclusion_review'){
      try{parsed=decodeAuditWire(parsed,issues=>{this.receipt.outputIssues=issues;});}catch{throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
      return {status:parsed.status,data:parsed.data,gaps:parsed.gaps,evidence_ids:[...new Set<string>(parsed.data.checks.flatMap((c:any)=>c.anchors.map((a:any)=>a.evidence_id)))],errors:[],revision:task.revision,usage:this.receipt.usage,model:QWEN_MODEL};
    }
    if(task.review&&isSelectionReviewFormat(parsed?.review_format)){
      try{parsed=decodeSelectionReview(parsed,task.role,catalog,issues=>{this.receipt.outputIssues=issues;});if(alternativeRef&&parsed.data.proposal){parsed.data.proposal.refs=[...new Set([...parsed.data.proposal.refs,alternativeRef])];parsed.evidence_ids=[...new Set([...parsed.evidence_ids,alternativeRef])];}this.receipt.normalizations=[...(this.receipt.normalizations||[]),'claim_selections_expanded'];}catch(error){throw new ProviderError((error as Error).message==='INVALID_MODEL_REFERENCE'?'INVALID_MODEL_REFERENCE':'INVALID_MODEL_OUTPUT',this.receipt);}
      return {...parsed,errors:[],revision:task.revision,usage:this.receipt.usage,model:QWEN_MODEL};
    }
    if(!task.review&&!task.purpose){try{const selected=parsed?.citation_format===CITATION_SELECTION_FORMAT;parsed=decodeCitationSelections(parsed,catalog,issues=>{this.receipt.outputIssues=issues});if(selected)this.receipt.normalizations=[...(this.receipt.normalizations||[]),'citation_selections_expanded'];}catch(error){throw new ProviderError((error as Error).message==='INVALID_MODEL_REFERENCE'?'INVALID_MODEL_REFERENCE':'INVALID_MODEL_OUTPUT',this.receipt)}}
    try{parsed=expandSourceFacts(parsed,catalog,!!task.review,issues=>{this.receipt.outputIssues=issues;});}catch{throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
    if(task.review){
      try{parsed=decodeReviewWire(parsed,task.role,issues=>{this.receipt.outputIssues=issues;});}
      catch{throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
      return {...parsed,errors:[],revision:task.revision,usage:this.receipt.usage,model:QWEN_MODEL};
    }
    // Usage comes from the provider envelope; model identity is the server-selected model, never generated text.
    let toolCalls:AgentToolCall[]|undefined;
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.prototype.hasOwnProperty.call(parsed,'tool_calls')){
      try{toolCalls=parseToolCalls((parsed as {tool_calls?:unknown}).tool_calls,issues=>{this.receipt.outputIssues=issues});}catch{this.receipt.outputIssues??=['tool_calls:invalid'];throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
      if(task.allow_tools===false&&toolCalls.length){this.receipt.outputIssues=['tool_calls:disabled_for_task'];throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
      delete (parsed as {tool_calls?:unknown}).tool_calls;
    }
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).some(k=>!['status','data','evidence_ids','gaps'].includes(k))){this.receipt.outputIssues=['root:invalid_object_or_keys'];throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
    if(toolCalls?.length&&!(parsed as {status?:unknown}).status)throw new AgentToolCalls(toolCalls);
    // Complete a redundant envelope only when every existing/nested ID is in the immutable input.
    // Never remove, rewrite or rescue a foreign reference. Unified validation still follows.
    const notes=parsed.data?.notes,proposalRefs=parsed.data?.proposal?.refs;
    if(Array.isArray(parsed.evidence_ids)&&Array.isArray(notes)&&notes.every((n:any)=>Array.isArray(n?.refs))&&(proposalRefs===undefined||Array.isArray(proposalRefs))){
      const declared=parsed.evidence_ids,nested=[...notes.flatMap((n:any)=>n.refs),...(proposalRefs||[]),...(Array.isArray(parsed.data?.checks)?parsed.data.checks.flatMap((c:any)=>Array.isArray(c?.anchors)?c.anchors.map((a:any)=>a?.evidence_id):[]):[]),...(Array.isArray(parsed.data?.disagreements)?parsed.data.disagreements.flatMap((d:any)=>Array.isArray(d?.refs)?d.refs:[]):[])];
      if([...declared,...nested].every(id=>typeof id==='string'&&task.evidence_ids.includes(id))&&nested.some(id=>!declared.includes(id))){parsed.evidence_ids=[...new Set([...declared,...nested])];this.receipt.normalizations=[...(this.receipt.normalizations||[]),'nested_refs_declared_in_envelope'];}
    }
    const result={...parsed,errors:[],revision:task.revision,usage:this.receipt.usage,model:QWEN_MODEL};
    if(toolCalls?.length)(result as ModelResult&{agentToolCalls:AgentToolCall[]}).agentToolCalls=toolCalls;
    return result;
  }
}
// Treat credentials as opaque. Only check safe header transport locally;
// validity, region and permissions are verified by the provider.
export function isQwenCredentialConfigured(secret:unknown){
  const key=typeof secret==='string'?secret.trim():'';
  return /^[\x21-\x7E]{8,1024}$/.test(key)&&!/["'`]/.test(key);
}
export function requireQwenCredentials(secret:unknown,protectionConfigured:boolean,confirmed:boolean){
  if(!protectionConfigured||!confirmed)throw new Error(`请先在百炼开启 ${QWEN_MODEL} 的免费额度用完即停，等待生效并完成服务端确认配置后再运行。应用无法查询该开关或保证账单金额。`);
  const key=typeof secret==='string'?secret.trim():'';
  if(!isQwenCredentialConfigured(secret))throw new Error('请在服务端将同一北京业务空间的 API Key 配置为 DASHSCOPE_API_KEY 密钥；密钥不能为空或包含空白、引号及控制字符。');
  return key;
}
