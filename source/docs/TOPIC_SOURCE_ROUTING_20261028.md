# 按题目分配渠道与网页发现接口

## 当前可用实现
Dify 主题优先 GitHub Issue、有限人工评论、官方项目知识检索文档与最近5条版本发布记录，再分配 Hacker News/其他来源。技术、业务主题优先问题讨论，通用主题沿用新闻、统计、订阅与百科；每词仍共享最多10次来源请求，没有增加模型次数或隐藏重试。

中文部分术语作程序映射后用于社区检索（如交接→customer handoff、Dify引用→Dify citation），原计划词与实际社区检索词随 collection.routing 保存并导出。映射不是语义检索，不保证召回。

Issue 评论保留原帖线程及哈希作者标识，过滤机器人回复；最多读取前2个 Issue 的首20条评论，最终至多6条人工评论。不是完整讨论，也不是独立客户样本。GitHub Discussions 专门接口尚未实现，不能称为已覆盖全部讨论区。

Dify 文档是固定官方项目文件，发布日期未知时明确提示；版本只读取最近5条，不能据未出现问题就推断从未修复。正文/片段、缺失日期、官方背景和用户线索分别说明。

## 可选网页搜索
实现 Tavily Search 适配，固定 api.tavily.com/search，basic、max_results=4、include_answer=false、auto_parameters=false、include_raw_content=text。不直接访问结果URL，使用服务返回的正文或摘要，摘要不冒充全文；凭据仅在服务器闭包，不进入项目、线程或浏览器。

默认未启用。需要服务器设置 TAVILY_API_KEY，并显式设置 WEB_SEARCH_ENABLED=true 后重新部署；只有密钥不足以启用。不要把 DashScope 密钥当作 Tavily 密钥。搜索服务有独立额度/账单，应用来源预算不等于外部免费额度保护，本轮没有配置或调用真实搜索服务。前端 /api/source-status 仅返回准备状态布尔值；采集记录记录未配置/未安排。

模型阶段工具调用、直接采集与手动搜索共用配置入口。Harness 输入保存公开来源策略版本，来源配置改变后拒绝旧线程恢复，实际请求仍沿用原预算。

## 验证
新增6组离线测试：主题与程序映射、人工评论与机器人过滤、固定官方来源/计数、搜索门控与摘要边界、0/1/2/3/4/6/10请求预算、状态不泄露密钥。默认完整离线API回归和生产构建含类型检查。未新增真实模型调用，外站实时可达性与搜索召回需单独验收。

官方参考：
- https://docs.github.com/en/rest/issues/comments
- https://docs.github.com/en/rest/releases/releases
- https://docs.tavily.com/documentation/api-reference/endpoint/search
