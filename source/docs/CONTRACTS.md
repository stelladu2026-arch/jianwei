# v0.1 在线契约

## 数据

Project：id（UUID）、version（写入并发版本）、revision（研究范围版本）、title、audience、region、period、exclusions、decision、mode（replay/manual）、status、confirmed、step、evidence、opportunities、history、reports、actions、budget。

Evidence：id、title、text（原文纯文本）、source、date（资料日期）、fetched（取得时间）、author（公开作者为哈希标识）、thread（讨论根）、url、kind（synthetic/public/imported）、stance（support/counter/context）、excluded、truncated。

Opportunity：人群、问题、替代、分析推断、初步建议、付费信号、引用 ID、反证、未知项、验证计划、研究版本、stale。

v0.1 不提供机器判定的 observed 字段：来源片段作为待核实线索呈现，conclusion 标记分析推断，unknowns 标记未知；人工填写不自动变成 verified。

## API

- GET `/api/projects` → `{projects}`（不触发创建或采集）
- POST `/api/projects` → `{project}`；title 必填；demo=true 创建虚构固定数据。
- PATCH `/api/projects/:id`：`{version, callId: UUID, action, data?}` → `{project}`。
- action：brief、confirm、step、pause、resume、cancel、archive、evidence、removeEvidence、import、opportunity、removeOpportunity、report、finish。
- DELETE `/api/projects/:id?version=N` → `{ok:true}`。
- POST `/api/search`：`{projectId,version,query}` → `{project,message}`。
- 错误 `{error}`：结构/规则错误 400，版本冲突 409，不存在 404，数据库读取暂时失败 503。

每次更新 SQL 带旧 version 条件；CAS 失败不覆盖。callId 在成功写入后保存，最多保留最近 50 条，超出窗口不提供永久幂等保证。导入没有 arbitrary URL 抓取；网络出口固定为 HN 搜索和官方条目接口。

## 状态与恢复

范围人工确认后 collecting。演示逐步到 analyzing → reviewing → awaiting_decision → completed。暂停记录 resume 和 step，继续从记录位置恢复。取消保留资料。人工研究通过 finish 确认交付，要求有已复核机会与验证计划；completed 不表示商业成立。

采集前保存预算预约，采集后核对 version/revision；此期间用户改动会导致迟到结果丢弃。每次最多 6 帖，尚未自动采集评论或按时间硬过滤；界面要求人工检查时间、人群和相关性。连续补查停止、并行模型预算、429 退避和完整研究 run 记录待下一阶段。

## 模型接口

`ResearchModelAdapter.execute(ModelTask, AbortSignal)` 契约见源码。目前 UnconfiguredModel 只明确拒绝，未配置外部推理。

真实接入要求：工具白名单、当前项目证据 ID、角色上下文分离、预算预约、输出 Schema 校验、引用核验、真实 token/模型版本、失败记录、revision 过期检查。先固定模型与资料做单角色基线，再加入四角色。
