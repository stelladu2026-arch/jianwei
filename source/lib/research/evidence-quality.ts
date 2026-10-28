// Deterministic risk hints; these never verify relevance, truth or customer identity.
export const QUALITY_POLICY_VERSION='evidence-boundary/2';
export type QualitySource={id:string;title:string;text:string;source?:string};
export function evidenceUseHint(input:unknown){
 const item=input&&typeof input==='object'?input as Record<string,unknown>:{};
 const s:QualitySource={id:typeof item.id==='string'?item.id:'未知编号',title:typeof item.title==='string'?item.title:'',text:typeof item.text==='string'?item.text:'',source:typeof item.source==='string'?item.source:''};
 const value=s.title+'\n'+s.text;
 if(/(?:##?\s*(?:acceptance criteria|required behavior|required scenarios|primary owner)|\[(?:P\d+[-–]\d+|Server Submission)\]|验收标准|开发任务)/i.test(value))return {id:s.id,label:'开发任务或提交说明',use:'仅作实现或方案线索，不能直接证明目标客户经历或购买需求'};
 if(/(?:show hn\s*:|we (?:built|launched)|our product|产品发布|产品宣传)/i.test(value))return {id:s.id,label:'产品展示或推广线索',use:'可用于了解替代方案，不能直接当作客户证言或成交证据'};
 if(/GitHub 文档|docs\.dify\.ai|dify\.ai.*网页抽取/i.test(s.source||''))return {id:s.id,label:'功能文档或产品说明',use:'仅说明已有能力或配置方式，不直接证明用户痛点、功能缺失或购买意愿'};
 if(/GitHub Issue/i.test(s.source||'')||/(?:bug report|steps to reproduce|expected behavior|actual behavior)/i.test(value))return {id:s.id,label:'公开问题或需求线索',use:'作者自述，需核查版本、部署条件、复现情况和当前修复状态，不能外推发生频率或付费'};
 if(/维基百科|Wikipedia|中国新闻网|国家统计局/i.test(s.source||''))return {id:s.id,label:'背景或统计资料',use:'仅用于背景或统计口径核查，不能直接证明具体目标客户经历或交易'};
 return {id:s.id,label:'资料用途待人工核查',use:'需核对作者身份、目标人群、场景和原文语境，不自动认定为用户经历或交易'};
}
export function evidenceQualitySummary(sources:unknown[]){const hints=sources.map(evidenceUseHint),risky=hints.filter(h=>!['资料用途待人工核查','公开问题或需求线索'].includes(h.label));return {version:QUALITY_POLICY_VERSION,hints,riskyCount:risky.length,allIndirect:hints.length>0&&risky.length===hints.length};}
export function evidenceQualityReport(sources:unknown[]){const q=evidenceQualitySummary(sources);return `## 证据用途与判断边界\n执行与结构检查不等于语义支持或商业验证。以下为规则提示，非语义质量评分。应用附注与抓取状态不是来源原话；旧资料中的导入提示也不能归为官方声明。\n${q.allIndirect?'当前所列资料全部触发开发任务、推广、功能文档或背景资料提示，暂不足以据此确认目标用户痛点；模型结论仅作为待验证假设。':'资料与目标人群、场景、因果关系和付款之间的支持程度仍待人工核查。'}\n${q.hints.map(h=>`- [${h.id}] ${h.label}：${h.use}。`).join('\n')}\n`;}
export const qualityInstructions='来源归属约束：applicationNote 是应用附注，sourceState 是抓取元数据，不是来源作者或官方原话；历史正文中的“资料性质”“Issue 状态”和“不代表一定已修复”等导入前缀也不得归为官方声明。文档描述现有功能不能证明缺少标准流程，未找到应写未取得直接证据。验证计划必须明确继续/停止的可观察条件，没有可靠数值基线则先采样建立基线，不编造已验证阈值。证据边界协议：先核对原文作者、目标角色、具体动作和问题后果。开发任务或验收清单只说明计划实现什么，不证明客户实际经历、问题频率或因果后果；产品展示只能说明替代方案，不能证明需求或付费。词面匹配和引用可定位均不等于语义支持。没有直接依据时将需求和商业价值写为待验证假设，决策优先 evidence，payment 为 none，并明确无法判断；证据不足正常返回 partial，不是执行故障。不得把减少50%等数字写成已证明的收益，拟定目标明确标为待校准实验标准。验证计划逐项写验证对象、动作、观察指标和继续/停止标准，缺失基线时先测基线。';
export function validationPlanWarnings(plan:string){
 const warnings:string[]=[];
 if(!/观察指标|记录.*(?:耗时|次数|比例|成功|失败)|衡量|测量|measure|metric/i.test(plan))warnings.push('计划未显式说明观察指标或记录方式。');
 if(!/继续标准|停止标准|继续条件|停止条件|通过标准|放弃|若.{0,50}(?:则|停止|继续)|如果.{0,50}(?:则|停止|继续)|success criteria|stop criteria/i.test(plan))warnings.push('计划未显式说明继续／停止条件。');
 return warnings;
}
