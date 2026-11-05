# 免费版0.1.1执行规则与验证 · 2026-11-06

用户已确认：专家免费安装，模型消耗走用户自己的WorkBuddy额度。本版不新增自有账号注册、会员付款或作者补贴接口。

## 已实施

- 独立资产标识dusihui-jianwei-research-free，展示名称“见微免费版”，卡片说明用户自己的模型额度。
- 机器可读策略references/runtime-policy.json：平台用户会话与计费来源、禁用作者模型/搜索/数据库兜底、未知余额不估算、额度不足停止保留。
- Agent执行指令：额度/鉴权受限即停止；不换账号、密钥或模型继续；不引导购买本专家解锁基础功能；不向作者网站后台发送研究内容。
- 打包检查：固定文件清单、严格策略匹配、插件/Agent字段检查、本地脚本导入与动态执行检查。没有将自定义计费字段塞入平台plugin.json。
- 本地报告附费用说明，明确脚本不读取积分或账单、不估算调用成本。
- 默认精简计划最多三次搜索、六次正文读取；不是平台账户硬配额，不代表固定模型调用次数。

## 实际本地验证

命令：python3 -m unittest discover -s integrations/workbuddy/tests -v
结果：34项测试，全部通过。包括作者计费路由/兜底被拒、注册/付费解锁策略被拒、混入外部服务/MCP/密钥文件被拒、网络和环境读取导入被拒、动态执行被拒，以及既有引用/覆盖/原文版本/报告检查。

命令：python3 integrations/workbuddy/package.py --output jianwei-workbuddy-free-review-0.1.1.zip
结果：构建成功，8个文件。SHA256：c5b6948e01e30de517acf4fcc81f015815452c1e9faf90e9cd3461d7cda14d41。
structural_checks=passed；execution_boundary=platform_user_only。
market_metadata=blocked：作者公开邮箱为空。marketplace_free_selection=requires_platform_configuration。
platform_install/live_tools/semantic_evaluation=not_run。

## 实际边界

本轮没有真实模型请求，没有配置生产凭据，没有修改既有网页版的数据库或模型配置。平台实际扣费及额度不足行为需独立测试账号在客户端验证，不能从离线测试推导。
打包检查是防回归机制，不是运行任意Python代码的安全沙箱；平台仍负责原生会话权限和计费。正式包需真实作者公开邮箱，免费属性需在发布页面配置，客户端安装与市场审核未完成。

前一份VERIFICATION_20261106.md保留0.1.0的历史结果；当前以本文件和本次CI为准。
