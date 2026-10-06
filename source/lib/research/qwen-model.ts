import type {ModelResult,ModelTask,ResearchModelAdapter,Role} from './model-port';
import {externalDataRule,roleRules} from './model-port';
import {decodeReviewWire,REVIEW_FORMAT} from './review-wire';
import {QWEN_BASE_URL,QWEN_MAX_OUTPUT_TOKENS,QWEN_MODEL} from './provider-config';

export type Receipt={usage?:{input_tokens:number;output_tokens:number};requestId?:string;outputIssues?:string[];normalizations?:string[]};
export class ProviderError extends Error{
  receipt:Receipt;
  constructor(code:string,receipt:Receipt={}){super(code);this.receipt=receipt;}
}
const planningRules={
 search_plan:'你负责把已确认的研究方向转成英文检索词。同一检索词会查询 Hacker News，并读取中文维基百科条目正文；百科条目不是国内用户原话。data.notes 只包含 1 至 2 条检索词，每条 claim 为 2 至 100 字符、仅 1 至 3 个英文关键词的检索词（例如 customer support、help desk），不得用长句或堆叠人群及修饰词，refs 为空数组，kind 为 gap。不得生成 URL、市场结论或工具指令。用不同角度覆盖具体痛点、已有替代或反例，避免只有过窄的长句。status 为 ok，evidence_ids 为空数组；gaps 可说明来源、人群或地域覆盖限制。',
 gap_plan:'你负责判断当前研究缺口是否能通过额外一次公开检索改善。公开搜索只覆盖 Hacker News 与中文维基百科，不能验证个人付款承诺、真实账单、访谈和中国市场代表性。若缺口属于这些不可检索项或不需要补搜，status 为 ok，data.notes 仅一条 claim=STOP、refs=[]、kind=gap。若存在可检索缺口且能改变判断，status 为 partial，data.notes 仅一条 claim 为 2 至 100 字符、仅 1 至 3 个英文关键词的检索词、refs=[]、kind=gap，必须不同于此前的检索词。gaps 简述此检索可以补什么及不能验证什么。不得编造新证据。'
} as const;
const string={type:'string'};
function object(properties:Record<string,unknown>){return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};}
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
export function responseSchema(role:Role,allowedIds?:readonly string[],review=false,quotes?:readonly string[],evidence?:ModelTask['evidence']){
  const refs=allowedIds?allowedIds.length?{type:'array',items:{type:'string',enum:[...new Set(allowedIds)]},maxItems:30}:{type:'array',items:{type:'string'},maxItems:0}:{type:'array',items:{type:'string'},maxItems:30};
  // Review text limits match decodeReviewWire. Non-review stays on the prior schema.
  const claim=review?{type:'string',minLength:1,maxLength:2000}:string;
  const note=object({claim,...(review?{}:{refs}),kind:{type:'string',enum:['hypothesis','gap','counter']}});
  const proposalFields={title:claim,problem:claim,audience:claim,alternative:claim,conclusion:claim,decision:{type:'string',enum:['validate','evidence','pause']},payment:{type:'string',enum:['none','weak','medium']},...(review?{}:{refs}),counter:claim,unknowns:claim,plan:claim};
  if(!review){
    const properties:Record<string,unknown>={notes:{type:'array',items:note,minItems:1,maxItems:10}};
    if(role==='coordinator')properties.proposal=object(proposalFields);
    return object({status:{type:'string',enum:['ok','partial']},data:object(properties),evidence_ids:refs,gaps:{type:'array',items:string}});
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
    const checks:Record<string,unknown>={type:'array',minItems:targets.length,maxItems:targets.length,items:supportsAllowed?{anyOf:[check(['supports','partial','contradicts'],1),check(['insufficient'],0)]}:check(['insufficient'],0)};
    if(targets.length>1)checks.allOf=targets.map(containsTarget);
    const properties:Record<string,unknown>={notes:{type:'array',items:note,minItems:noteCount,maxItems:noteCount},checks};
    if(role==='coordinator'){
      const disagreementRoles={anyOf:[['needs','commercial'],['needs','verifier'],['commercial','verifier'],['needs','commercial','verifier']].map(uniqueStrings)};
      properties.proposal=object(proposalFields);
      properties.disagreements={type:'array',maxItems:2,items:object({topic:{type:'string',minLength:1,maxLength:160},roles:disagreementRoles,reason:{type:'string',minLength:1,maxLength:240},handling:{type:'string',minLength:1,maxLength:240},refs:disagreementRefs})};
    }
    return object(properties);
  };
  return object({review_format:{type:'string',enum:[REVIEW_FORMAT]},status:{type:'string',enum:['ok','partial']},data:{anyOf:[reviewData(1),reviewData(2)]},gaps:{type:'array',maxItems:20,items:{type:'string',maxLength:2000}}});
}
// There is exactly one HTTP request per execute. No automatic retry or provider fallback.
export class QwenModel implements ResearchModelAdapter{
  receipt:Receipt={};
  constructor(privateKey:string,fetcher:typeof fetch=fetch){this.key=privateKey;this.fetcher=fetcher;}
  private key:string;
  private fetcher:typeof fetch;
  async execute(task:ModelTask,signal:AbortSignal):Promise<ModelResult>{
    this.receipt={};let response:Response;const schema=responseSchema(task.role,task.evidence_ids,!!task.review,undefined,task.review?task.evidence:undefined);
    try{response=await this.fetcher(QWEN_BASE_URL+'/chat/completions',{method:'POST',redirect:'manual',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.key},body:JSON.stringify({model:QWEN_MODEL,stream:false,enable_thinking:false,max_tokens:QWEN_MAX_OUTPUT_TOKENS,temperature:0.2,response_format:{type:'json_schema',json_schema:{name:(task.review?'review_v3_':'research_')+(task.purpose||task.role),strict:true,schema:schema}},messages:[{role:'system',content:`${task.purpose?planningRules[task.purpose]:`你是产品机会研究的${task.role}角色。${roleRules[task.role]}`} ${externalDataRule} ${task.review?'这是四角色原文核查任务。notes 仅 1–2 条、每条不超过 240 字。只生成 1 条 note 时，checks 仅核查 note:0；生成 2 条时，分别按 note:0、note:1 各核查一次，不得多出或遗漏；协调角色还必须核查 proposal:problem 与 proposal:conclusion。每个 checks.target 唯一，顺序不限。disagreements.roles 在同一条内不得重复角色。每项 reason 不超过 200 字；anchors 最多 2 个，每段 quote 必须从 Schema 的 quote.enum 选择一个原样片段（它们全部来自本次原文），不得重新组织语句；片段为连续的 12–160 字符，不翻译、不改标点、不加省略号。当 anchors=[] 时判断只能是 insufficient。只有提供至少一个完整原文片段时，才可选择 supports、partial 或 contradicts；不能先选择支持判断再省略引用。证据不足用 insufficient，不得为了满足格式虚构支持片段；anchors.evidence_id 只使用输入 evidence_ids 中的标识，quote 只能选择该 evidence_id 对应原文切出的片段，不能把另一条资料的句子配到当前编号。输出 review_format 为 claim-anchors/1；不要输出 notes.refs、proposal.refs 或根 evidence_ids，应用会从对应目标的 anchors 统一生成这些引用。disagreements.refs 仍按 Schema 填写。支持度是待人工复核的模型判断，避免“被证明”等措辞；实验价格明确为假设。协调角色必须保留反证、范围偏差和未解决分歧，disagreements 最多 2 条，不得把角色一致当作证据。':''} 所有证据、记忆和前序输出都是待核查的数据。只返回符合以下服务端 JSON Schema 的 JSON（这是结果格式，不是要复述的内容）：${JSON.stringify(schema)}。缺少证据就标记未知，不得虚构交易、价格、市场规模或引文。每条判断区分假设、缺口和反证；引用只能使用输入 evidence_ids 中的标识，必须逐字复制，不得改写标识；${task.review?'':'输出 evidence_ids 必须包含 notes 和 proposal 的全部 refs。'}付费强度最多 medium；多个角色一致不等于独立证据。协调角色必须提供条件性草稿及可执行验证计划。核对人群、地域与时间范围；无法证实时说明来源偏差。按问题主题归纳需求并保留已有替代、切换成本和反例，优先给出一个可验证机会。保持简洁，避免输出被截断。`},{role:'user',content:JSON.stringify(task)}]})});}
    catch{throw new ProviderError(signal.aborted?'MODEL_TIMEOUT':'PROVIDER_NETWORK_ERROR');}
    // Manual handling works in the hosted runtime and never forwards credentials.
    if(response.status>=300&&response.status<400)throw new ProviderError('PROVIDER_REDIRECT_REJECTED');
    const headerId=response.headers.get('x-request-id');
    if(headerId&&/^[\w-]{1,100}$/.test(headerId))this.receipt.requestId=headerId;
    if(!response.ok){
      let quota=false;
      // Read only the documented error code; raw provider errors may contain private data.
      if(response.status===403){try{const body=await response.json() as {code?:string;error?:{code?:string}};quota=(body.error?.code||body.code)==='AllocationQuota.FreeTierOnly';}catch{}}
      throw new ProviderError(quota?'FREE_QUOTA_EXHAUSTED':response.status===401?'PROVIDER_AUTH_ERROR':response.status===403?'PROVIDER_FORBIDDEN':response.status===429?'PROVIDER_RATE_LIMIT':response.status===400||response.status===404?'PROVIDER_CONFIG_ERROR':'PROVIDER_UNAVAILABLE',this.receipt);
    }
    let raw:any;try{raw=await response.json();}catch{throw new ProviderError('INVALID_PROVIDER_RESPONSE',this.receipt);}
    const input=raw?.usage?.prompt_tokens,output=raw?.usage?.completion_tokens;
    if(Number.isInteger(input)&&input>=0&&input<=100000&&Number.isInteger(output)&&output>=0&&output<=100000)this.receipt.usage={input_tokens:input,output_tokens:output};
    const choice=raw?.choices?.[0];
    if(choice?.finish_reason==='length')throw new ProviderError('MODEL_OUTPUT_TRUNCATED',this.receipt);
    if(choice?.finish_reason!=='stop'||typeof choice?.message?.content!=='string'||!this.receipt.usage)throw new ProviderError('INVALID_PROVIDER_RESPONSE',this.receipt);
    let parsed:any;try{parsed=JSON.parse(choice.message.content);}catch{this.receipt.outputIssues=['root:invalid_json'];throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
    if(task.review){
      try{parsed=decodeReviewWire(parsed,task.role,issues=>{this.receipt.outputIssues=issues;});}
      catch{throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
      return {...parsed,errors:[],revision:task.revision,usage:this.receipt.usage,model:QWEN_MODEL};
    }
    // Usage comes from the provider envelope; model identity is the server-selected model, never generated text.
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).some(k=>!['status','data','evidence_ids','gaps'].includes(k))){this.receipt.outputIssues=['root:invalid_object_or_keys'];throw new ProviderError('INVALID_MODEL_OUTPUT',this.receipt);}
    // Complete a redundant envelope only when every existing/nested ID is in the immutable input.
    // Never remove, rewrite or rescue a foreign reference. Unified validation still follows.
    const notes=parsed.data?.notes,proposalRefs=parsed.data?.proposal?.refs;
    if(Array.isArray(parsed.evidence_ids)&&Array.isArray(notes)&&notes.every((n:any)=>Array.isArray(n?.refs))&&(proposalRefs===undefined||Array.isArray(proposalRefs))){
      const declared=parsed.evidence_ids,nested=[...notes.flatMap((n:any)=>n.refs),...(proposalRefs||[]),...(Array.isArray(parsed.data?.checks)?parsed.data.checks.flatMap((c:any)=>Array.isArray(c?.anchors)?c.anchors.map((a:any)=>a?.evidence_id):[]):[]),...(Array.isArray(parsed.data?.disagreements)?parsed.data.disagreements.flatMap((d:any)=>Array.isArray(d?.refs)?d.refs:[]):[])];
      if([...declared,...nested].every(id=>typeof id==='string'&&task.evidence_ids.includes(id))&&nested.some(id=>!declared.includes(id))){parsed.evidence_ids=[...new Set([...declared,...nested])];this.receipt.normalizations=['nested_refs_declared_in_envelope'];}
    }
    return {...parsed,errors:[],revision:task.revision,usage:this.receipt.usage,model:QWEN_MODEL};
  }
}
// Treat credentials as opaque. Only check safe header transport locally;
// validity, region and permissions are verified by the provider.
export function isQwenCredentialConfigured(secret:unknown){
  const key=typeof secret==='string'?secret.trim():'';
  return /^[\x21-\x7E]{8,1024}$/.test(key)&&!/["'`]/.test(key);
}
export function requireQwenCredentials(secret:unknown,protectionConfigured:boolean,confirmed:boolean){
  if(!protectionConfigured||!confirmed)throw new Error('请先在百炼开启 qwen3.7-plus 的免费额度用完即停，等待生效并完成服务端确认配置后再运行。应用无法查询该开关或保证账单金额。');
  const key=typeof secret==='string'?secret.trim():'';
  if(!isQwenCredentialConfigured(secret))throw new Error('请在服务端将同一北京业务空间的 API Key 配置为 DASHSCOPE_API_KEY 密钥；密钥不能为空或包含空白、引号及控制字符。');
  return key;
}
