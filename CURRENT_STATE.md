# 当前状态与架构

> **2026-10-23 验收更新**：Qwen 已成功返回真实生成结果，Turso 真实读写已确认；本轮发现验收脚本漏传结果信封中的工具请求，现已统一正式流程与验收适配并补回归。完整离线回归 579 项通过，修复后的真实工具循环与网站全流程仍待验收，尚未推广正式版。以 [最新验收记录](source/docs/HARNESS_LIVE_20261023.md) 为准。

> **2026-10-22 更新**：正式版源码与 Harness 恢复入口、后台推进已整合，完整回归在两种数据库边界各通过 569 项，Next/Sites 构建及类型检查通过。尚未部署或执行本轮真实 Qwen/Turso 联调；发布需完成一次 Vercel CLI 设备授权。最新交付、验收边界和接续步骤见 [Harness 整合记录](source/docs/HARNESS_INTEGRATION_20261022.md)。以下为 2026-10-05 历史交接记录。

## 已实现

- 中文研究工作台：确认范围、资料导入、HN 公开采集、来源去重、机会卡、快照及导出。
- 单角色自动研究：计划英文检索词 → HN 帖子及一级评论回源 → 分析 → 缺口判断 → 最多一轮补搜 → 本地检查 → 研究草稿。已有真实成功验收，成功轮 3 次模型请求；不是所有轮均成功。
- 四角色复核已有资料：需求、商业、独立反证、协调各一次请求。同一冻结资料、每角色最多两条笔记。独立反证不读前序结论或记忆；协调读取三个角色的有界摘要。
- 版本检查、预算预留、callId 幂等、暂停、取消、迟到结果隔离、超时恢复、失败记录与反思。四角色失败不能在原轮模型重试，新轮上限 4 次。
- 失败原因、失败详情、刷新配置、结束本轮、保留记录并开始新轮，以及全产品异常状态恢复指引。
- 项目内显式偏好、纠正、候选经验及有效期/引用过滤；规则反思和人工验证记录。
- 单角色/四角色模拟执行、14 组固定流程评测、人工对照入口。模拟评测验证流程约束，不测真实语义准确率。

## 真实验证的边界

| 能力 | 当前证据 |
|---|---|
| Qwen 接入 | 单角色真实调用成功，密钥已经配置于原线上站点 |
| 自动采集与单角色研究 | 真实 HN 输入完整流程通过，草稿已保存 |
| 四角色需求/商业/独立反证 | 最近用户轮三阶段通过结构和原文定位检查 |
| 协调汇总与完整四角色报告 | 最近轮协调失败；修复后只做离线验证，待真实验收 |
| 多角色优于单角色 | 未证实；没有完整人工对照结论或准确率 |
| 新引用格式的提供方兼容性 | 待真实模型输出验证；不因离线通过而宣称已验证 |
| 费用 | 应用付费预算 ¥0，实际账单及剩余额度需百炼核对 |

最近用户轮 ID：`596a9737-8c04-421d-b25a-dcf2d1ced2d2`，项目 ID：`07902449-b861-4db8-b1eb-cb4a21fc5d83`。4/4 请求已用完，输入 36893 / 输出 3647 词元。错误 `INVALID_MODEL_REFERENCE`，字段 `data.checks.2.anchors.0.evidence_id:not_in_claim`，即第 3 项核查的第 1 段引文编号不在对应主张引用中。被拒输出未保存，不能猜测具体主张、编号或引文。

## 本次修复

旧输出同时要求模型填写 note/proposal.refs、checks.anchors.evidence_id 和根 evidence_ids，多份列表可能不一致。仅补提示词无法消除这种结构风险。

现在发送 `review_v3_*` JSON Schema，明确 `review_format=claim-anchors/1`。模型在对应核查目标的 anchors 中声明主张引用，应用生成 note.refs、proposal 的两个核查目标引用并集和根 evidence_ids；分歧 refs 仍单独填写并接受引用边界验证。内部保存/展示结构不变，新运行协议为 `evidence-review/2`。

新格式夹带旧 refs/根 evidence_ids、未知版本、角色越权字段直接拒绝。没有给旧错误输出补引用或改写判断。漏检、重复目标、外来编号和引文在对应冻结原文逐字定位的校验仍执行。失败提示明确条目/片段序号，历史失败和已花费预算不改写。

核心文件：`lib/research/review-wire.ts`、`qwen-model.ts`、`review-contract.ts`、`collaboration.ts`。测试：`tests/review-schema-smoke.mjs`、`tests/collaboration-smoke.mjs`。现场概要：`docs/V6_COORDINATOR_REFERENCE_FAILURE.json`。

## 架构地图（路径相对 source）

| 文件/目录 | 责任 |
|---|---|
| `app/page.tsx`、`components/research-{workflow,execution,collaboration,governance}.tsx` | 研究工作台 UI、状态操作及研究/执行/对照/治理面板 |
| `app/api/projects/` | 项目 CRUD、状态/范围确认及上下文接口 |
| `app/api/projects/[id]/workflow/route.ts` | 自动研究和四角色工作流 API、预算与检查点 |
| `app/api/projects/[id]/run/route.ts` | 独立模拟/真实执行与固定评测 |
| `lib/research/domain.ts` | 项目、证据、机会、报告及领域约束 |
| `lib/research/execution.ts` | 统一结果校验、执行预算与输入边界 |
| `lib/research/collaboration.ts` | 四角色冻结输入、盲核查、引文定位和对照 |
| `lib/research/governance*.ts` | 角色能力、记忆与反思管理 |
| `lib/research/collection.ts` | 固定目的地 HN 采集，限制来源次数及正文资格 |
| `lib/research/qwen-*.ts`, `provider-config.ts` | 服务端密钥、固定模型端点、格式与回执 |
| `lib/research/store.ts`, `db/`, `drizzle/` | D1/SQLite 持久化、CAS 和结构迁移 |
| `build/`, `vite.config.ts`, `scripts/` | Vinext/Workers 构建与本地预览适配 |
| `tests/` | 实际 API 路由、内存 SQLite、模拟 HTTP 和独立 Schema 校验 |

实际实现为 React/TypeScript + Vinext + Cloudflare Workers + D1。单角色模型步骤使用 LangGraph.js 的 web 构建做工具循环；Python/FastAPI 没有接入，不能写成后端。存储目前是单用户空间，授权由原托管站点控制面保障；应用数据库尚未实现多人资源隔离。
