# 渠道扩展 2026-10-29

新增博查网页搜索（固定 api.bocha.cn/v1/web-search，最多4条，summary/snippet 始终标为摘要）；GitHub Discussions GraphQL（单请求至多3个讨论、每讨论3条评论与已采纳答案，过滤 Bot、去重并保留线程）；Discourse 搜索并读取首个主题有限正文（共享预算、不自动分页）。

配置仅在服务器环境变量：
- BOCHA_API_KEY 与 BOCHA_SEARCH_ENABLED=true；
- 原 Tavily 保持 TAVILY_API_KEY 与 WEB_SEARCH_ENABLED=true；
- GITHUB_DISCUSSIONS_TOKEN 与 GITHUB_DISCUSSIONS_ENABLED=true，仅需公开讨论读取权限；
- RESEARCH_COMMUNITIES=n8n 或 discourse 或 cloudflare。当前每轮最多选择一个，允许列表防止任意网络目的地；无配置不请求。

密钥不进入状态接口或项目快照，配置摘要加入来源策略版本。UI 区分各提供方准备状态，不将已配置称为已采集。多渠道仍共享每词10次来源请求，实际失败也记账；不新增模型调用、隐藏重试、付费回退或分页。低预算可能不安排所有渠道，以回执为准。

搜索结果 URL 不自动请求。社区读取仅固定主机、拒绝重定向、10秒超时与响应体上限；受限论坛失败时不绕过登录。摘要不作为全文，发布日期缺失不保证时间范围。同线程多个评论不代表独立客户；已采纳答案不证明已验证。

参考接口：https://github.com/bocha-ai/dsh-web-search-bocha 、https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions 、https://docs.discourse.org/ 。

验证：新增离线用例涵盖门控、摘要、固定目的地、GraphQL错误、机器人与重复回复、社区预算以及所有渠道共享总上限。完整 API 回归、TypeScript、Next 生产构建结果以本次实际检查为准。未配置真实密钥，未执行真实搜索/模型验收，实际召回与访问权限待验收。
