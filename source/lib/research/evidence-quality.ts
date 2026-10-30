import type {ProposalBasis} from './proposal-basis';
import {developmentArtifact,interfaceArtifact,promotionalArtifact} from './source-fit';
// Deterministic risk hints; these never verify relevance, truth or customer identity.
export const QUALITY_POLICY_VERSION='evidence-boundary/7';
export type QualitySource={id:string;title:string;text:string;source?:string};
export function evidenceUseHint(input:unknown){
 const item=input&&typeof input==='object'?input as Record<string,unknown>:{};
 const s:QualitySource={id:typeof item.id==='string'?item.id:'未知编号',title:typeof item.title==='string'?item.title:'',text:typeof item.text==='string'?item.text:'',source:typeof item.source==='string'?item.source:''};
 const value=s.title+'\n'+s.text;
 if(interfaceArtifact(s.title,s.text))return {id:s.id,label:'界面字段或引用副本',use:'仅展示界面内容，不构成具体使用经历或独立客户反馈'};
 if(developmentArtifact(s.title,s.text))return {id:s.id,label:'开发任务或提交说明',use:'原型或实现任务仅作方案背景，不能作为目标用户经历或购买需求'};
 if(/\[mirror\]|镜像|转载/i.test(s.title))return {id:s.id,label:'镜像或转载问题线索',use:'先回溯原始问题并核查版本和修复状态，不把镜像当独立反馈或已核实事实'};

 if(promotionalArtifact(s.title,s.text))return {id:s.id,label:'产品展示或推广线索',use:'可用于了解替代方案，不能直接当作客户证言或成交证据'};
 if(/GitHub 文档|docs\.dify\.ai|dify\.ai.*网页抽取/i.test(s.source||''))return {id:s.id,label:'功能文档或产品说明',use:'仅说明已有能力或配置方式，不直接证明用户痛点、功能缺失或购买意愿'};
 if(/GitHub Discussions|产品社区/i.test(s.source||''))return {id:s.id,label:'公开讨论与解决建议',use:'区分提问者经历、其他用户建议和已采纳答案；同线程不代表独立客户，已采纳不等于核实'};
 if(/博查|网页搜索发现/i.test(s.source||''))return {id:s.id,label:'搜索发现线索',use:'先核查是否取得原文，搜索摘要不作为独立需求证据'};
 if(/GitHub Issue/i.test(s.source||'')||/(?:bug report|steps to reproduce|expected behavior|actual behavior)/i.test(value))return {id:s.id,label:'公开问题或需求线索',use:'作者自述，需核查版本、部署条件、复现情况和当前修复状态，不能外推发生频率或付费'};
 if(/维基百科|Wikipedia|中国新闻网|国家统计局/i.test(s.source||''))return {id:s.id,label:'背景或统计资料',use:'仅用于背景或统计口径核查，不能直接证明具体目标客户经历或交易'};
 return {id:s.id,label:'资料用途待人工核查',use:'需核对作者身份、目标人群、场景和原文语境，不自动认定为用户经历或交易'};
}
export function evidenceQualitySummary(sources:unknown[]){const hints=sources.map(evidenceUseHint),risky=hints.filter(h=>!['资料用途待人工核查','公开问题或需求线索'].includes(h.label));return {version:QUALITY_POLICY_VERSION,hints,riskyCount:risky.length,allIndirect:hints.length>0&&risky.length===hints.length};}
export function evidenceQualityReport(sources:unknown[]){const q=evidenceQualitySummary(sources);return `## 证据用途与判断边界\n执行与结构检查不等于语义支持或商业验证。以下为规则提示，非语义质量评分。应用附注与抓取状态不是来源原话；旧资料中的导入提示也不能归为官方声明。\n${q.allIndirect?'当前所列资料全部触发开发任务、镜像转载、推广、功能文档或背景资料提示，暂不足以据此确认目标用户痛点；模型结论仅作为待验证假设。':'资料与目标人群、场景、因果关系和付款之间的支持程度仍待人工核查。'}\n${q.hints.map(h=>`- [${h.id}] ${h.label}：${h.use}。`).join('\n')}\n`;}
export const qualityInstructions='技术语义约束：time saved 表示节省的时间统计，不能解释为调度触发时间或时区修复。来源说已有恢复机制未生效，不能归纳成没有恢复机制；必须保留版本、部署模式和异常条件。社区作者的变通只作待核查候选，不使用“应采用”“必须”“需外部轮询”等实施指令。hypothesis 不得称“已确认”或“已证实”。数值继续/停止门槛没有基线依据时先测基线；拟定数值明确标为待校准实验标准。 机会草稿的问题字段也必须遵守证据边界：若没有目标人群直接经历，问题必须以“待验证假设：”开头，不得断言缺乏工具。销售帖与工具发布只作供给线索，标价不等于成交，开发路线图不等于功能已上线。 人群与场景核对：逐条确认原文中的使用者、业务动作和问题后果是否对应简报；只有泛词相同、不同角色或不同业务场景的资料不作为需求支持。不能将别的行业的开发计划归纳成目标客户现状。没有直接来源支撑的现状、普遍使用方式、替代缺失与因果后果应保留未知或明确写待验证假设，不能用常识补齐。口头愿意付费只作兴趣信号，不能单独作为投入开发标准；验证计划需包含近期真实案例、发生频率、耗时、现有工具或可观察试用行为。替代与能力约束：没有官方资料或可复现结果时，不断言产品缺少某项能力，只能写本轮尚未取得能力核查依据。某节点不受某缺陷影响，不等于可以替代另一种职责的节点；提出替代方案必须说明输入、职责、输出与适用条件，缺证据时标为待核查，不当作可用解决方案。镜像或转载需要回溯原始来源；未回溯时技术细节仅为作者自述，不能宣称修复已验证。来源归属约束：applicationNote 是应用附注，sourceState 是抓取元数据，不是来源作者或官方原话；历史正文中的“资料性质”“Issue 状态”和“不代表一定已修复”等导入前缀也不得归为官方声明。文档描述现有功能不能证明缺少标准流程，未找到应写未取得直接证据。验证计划必须明确继续/停止的可观察条件，没有可靠数值基线则先采样建立基线，不编造已验证阈值。证据边界协议：先核对原文作者、目标角色、具体动作和问题后果。开发任务或验收清单只说明计划实现什么，不证明客户实际经历、问题频率或因果后果；产品展示只能说明替代方案，不能证明需求或付费。词面匹配和引用可定位均不等于语义支持。没有直接依据时将需求和商业价值写为待验证假设，决策优先 evidence，payment 为 none，并明确无法判断；证据不足正常返回 partial，不是执行故障。不得把减少50%等数字写成已证明的收益，拟定目标明确标为待校准实验标准。验证计划逐项写验证对象、动作、观察指标和继续/停止标准，缺失基线时先测基线。';
export function validationPlanWarnings(plan:string){
 const warnings:string[]=[];
 if(!/(?:耗时|频率|次数|比例|数量|时间)[^。\n]{0,30}(?:超过|至少|低于|高于|\d+\s*(?:分钟|小时|次|%))|观察指标|记录[\s\S]{0,100}(?:耗时|次数|比例|成功|失败|时间|偏差|误差|延迟|准确率|频率)|统计[\s\S]{0,60}(?:频率|次数|比例|数量)|比较[\s\S]{0,60}(?:偏差|差异|耗时)|(?:超过|至少|不少于|达到|高于|低于|半数|多数|\d+\s*%)[\s\S]{0,60}(?:受访|访谈|用户|团队|人|愿意|表示)|衡量|测量|measure|metric/i.test(plan))warnings.push('计划未显式说明观察指标或记录方式。');
 if(!/继续标准|停止标准|继续条件|停止条件|通过标准|放弃|若.{0,50}(?:则|停止|继续)|如果.{0,50}(?:则|停止|继续)|success criteria|stop criteria/i.test(plan))warnings.push('计划未显式说明继续／停止条件。');
 if(/愿意[\s\S]{0,30}(?:付费|支付)|willing.{0,12}pay/i.test(plan)&&!/(?:试用|实际使用|真实案例|记录.{0,20}(?:耗时|频率)|行为承诺|提供.{0,12}(?:材料|流程|记录)|pilot|trial)/i.test(plan))warnings.push('计划主要依赖口头付费意愿，尚缺真实案例、使用成本或试用行为验证。');
 if(/\d+(?:\.\d+)?\s*%|\d+\s*(?:分钟|小时)/.test(plan)&&!/基线|待校准|拟定|实验标准/.test(plan))warnings.push('计划含数值门槛，但未说明基线或待校准性质；先采样再确定投入标准。');
 return warnings;
}

export function researchClaimWarnings(proposal:{problem?:string;alternative?:string;conclusion?:string;counter?:string;basis?:ProposalBasis},sources:QualitySource[]){const warnings:string[]=[];
 if(proposal.counter&&/官方|版本记录/.test(proposal.counter)){const ids=proposal.basis?.counter.map(a=>a.evidence_id);if(!ids||!sources.some(s=>ids.includes(s.id)&&/GitHub 文档|官方|docs\./i.test(s.source||'')))warnings.push('反证提到官方或版本记录，但没有为该字段附上对应官方原文；请逐项核对。');}
 if(/(?:缺乏|缺少|没有|不支持).{0,12}自动恢复/.test(proposal.problem||'')&&sources.some(s=>/should already|built-in.{0,30}recovery|已有.{0,12}恢复机制/i.test(s.text)))warnings.push('来源包含已有恢复机制的描述；机制在特定条件下失效不能直接推为能力不存在。');
 if(/(?:应采用|必须|需外部|需要外部).{0,30}(?:监控|轮询|检测|脚本)/.test([proposal.problem,proposal.conclusion,proposal.counter].join(' ')))warnings.push('外部监控或轮询仍是候选建议，须核查版本、配置、风险和复现结果后再决定。');
 const problemIds=proposal.basis?.problem.map(a=>a.evidence_id);const official=sources.some(s=>/GitHub 文档|官方|docs\./i.test(s.source||''));const problemOfficial=sources.some(s=>(!problemIds||problemIds.includes(s.id))&&/GitHub 文档|官方|docs\./i.test(s.source||''));if(!problemOfficial&&/缺乏|缺少|未提供|不支持/.test(proposal.problem||''))warnings.push('本轮引用未包含官方能力核查资料，功能缺失的判断尚未得到验证。');if(!official&&!/未取得.{0,30}直接证据/.test(proposal.alternative||'')&&/替代|规避|绕过/.test(proposal.alternative||''))warnings.push('替代或规避方案尚缺官方依据或复现结果，请先核查职责与适用条件，不能据此直接实施。');if(sources.some(s=>/\[mirror\]|镜像|转载/i.test(s.title)))warnings.push('引用包含镜像或转载线索，尚需回溯原始来源并核查版本、复现和修复状态。');return warnings;}
