请接手本文件同目录的“见微 · 产品机会研究 Agent”项目。完整源码在 source/，这是已经发布的版本 6d8f00c73d44e329708c6e625d75382f0145ee7e。

先阅读 START_HERE.md、CURRENT_STATE.md、LOCAL_SETUP.md、ROADMAP.md、ATTENTION.md、AGENTS.md，以及 source/docs/ORIGINAL_DESIGN.md、VERIFICATION.md、MULTI_AGENT_REVIEW.md 的最新日期条目。当前实现是 React/TypeScript + Vinext + Workers + D1。单角色步骤使用 LangGraph.js；没有 Python/FastAPI 后端。

本轮目标：建立本地可运行、可测试的开发环境，审查新 review_v3 引用格式与应用校验一致性，准备一次可审计的真实四角色验收。不要先扩展 Agent 数量、换模型或大改架构。

按顺序处理：
1. 使用 Node 24 和 pnpm 11.25.0，在 source/ 普通 frozen-lockfile 安装；运行 node tests/run-local-api.mjs、pnpm exec tsc --noEmit、pnpm run build。已有 202 项离线检查通过。记录本机实际结果，不继承其他机器的成功说法。
2. 初始化本地 D1，用模拟模式检查研究与失败恢复交互；缺少本地环境配置时先处理，无需请求真实 Key。
3. 阅读 review-wire.ts、qwen-model.ts、review-contract.ts、collaboration.ts 及两个 review/collaboration 测试，审查引用只声明一次的映射、角色字段、核查覆盖、引用边界与原文定位，发现明确不一致则补有意义的回归后修复。
4. 真实完整四角色目前仍未通过：最近轮前三阶段成功，协调因 data.checks.2.anchors.0.evidence_id:not_in_claim 停止，原轮 4/4 已耗尽。新版本只在离线验证通过，不能改写历史为成功。
5. 先把真实验收输入、最多四次的新轮预算、记录项目和停止条件准备好。只有用户明确安排真实验收且免费保护及额度满足时，才执行该轮。失败立即保留安全字段/回执并停止，不追加诊断生成或自动重试。
6. 根据结果更新验收记录及路线图。若真实轮通过，安排人工支持度/反例/范围和计划检查后再考虑 P1。若失败，先离线复现契约，不循环消耗额度。

必须保持：服务端 Key、固定北京端点、¥0 付费预算、冻结输入、盲反证、无付费 fallback、严格逐字引用、CAS/幂等/lease、取消后的迟到结果拒绝、候选经验人工确认、失败历史与用量保留。不能用合并旧 refs 或模糊引文匹配来“修复”被拒结果。

原线上站点 Key 和私有 D1 不在本包。Cursor 无原站点自动发布权限；要接到自己的托管平台，先处理授权、真实数据库及 secret，再部署。变更后交付明确的改动、验证、未完成项和调用用量。
