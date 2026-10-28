// Deterministic risk hints; these never verify relevance, truth or customer identity.
export const QUALITY_POLICY_VERSION='evidence-boundary/1';
export type QualitySource={id:string;title:string;text:string;source?:string};
export function evidenceUseHint(input:unknown){
 const item=input&&typeof input==='object'?input as Record<string,unknown>:{};
 const s:QualitySource={id:typeof item.id==='string'?item.id:'未知编号',title:typeof item.title==='string'?item.title:'',text:typeof item.text==='string'?item.text:'',source:typeof item.source==='string'?item.source:''};
 const value=s.title+'\n'+s.text;
 if(/(?:##?\s*(?:acceptance criteria|required behavior|required scenarios|primary owner)|\[(?:P\d+[-–]\d+|Server Submission)\]|验收标准|开发任务)/i.test(value))return {id:s.id,label:'开发任务或提交说明',use:'仅作实现或方案线索，不能直接证明目标客户经历或购买需求'};
 if(/(?:show hn\s*:|we (?:built|launched)|our product|产品发布|产品宣传)/i.test(value))return {id:s.id,label:'产品展示或推广线索',use:'可用于了解替代方案，不能直接当作客户证言或成交证据'};
 if(/维基百科|Wikipedia|中国新闻网|国家统计局/i.test(s.source||''))return {id:s.id,label:'背景或统计资料',use:'仅用于背景或统计口径核查，不能直接证明具体目标客户经历或交易'};
 return {id:s.id,label:'资料用途待人工核查',use:'需核对作者身份、目标人群、场景和原文语境，不自动认定为用户经历或交易'};
}
export function evidenceQualitySummary(sources:unknown[]){const hints=sources.map(evidenceUseHint),risky=hints.filter(h=>h.label!=='资料用途待人工核查');return {version:QUALITY_POLICY_VERSION,hints,riskyCount:risky.length,allIndirect:hints.length>0&&risky.length===hints.length};}
export function evidenceQualityReport(sources:unknown[]){const q=evidenceQualitySummary(sources);return `## 证据用途与判断边界\n执行与结构检查不等于语义支持或商业验证。以下为规则提示，非语义质量评分。\n${q.allIndirect?'当前所列资料全部触发开发任务、推广或背景资料提示，暂不足以据此确认目标用户痛点；模型结论仅作为待验证假设。':'资料与目标人群、场景、因果关系和付款之间的支持程度仍待人工核查。'}\n${q.hints.map(h=>`- [${h.id}] ${h.label}：${h.use}。`).join('\n')}\n`;}
export const qualityInstructions='证据边界协议：先核对原文作者、目标角色、具体动作和问题后果。开发任务或验收清单只说明计划实现什么，不证明客户实际经历、问题频率或因果后果；产品展示只能说明替代方案，不能证明需求或付费。词面匹配和引用可定位均不等于语义支持。没有直接依据时将需求和商业价值写为待验证假设，决策优先 evidence，payment 为 none，并明确无法判断；证据不足正常返回 partial，不是执行故障。不得把减少50%等数字写成已证明的收益，拟定目标明确标为待校准实验标准。验证计划逐项写验证对象、动作、观察指标和继续/停止标准，缺失基线时先测基线。';
