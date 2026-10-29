# 随代码更新的逻辑文档

这组文档以当前分支的源码为依据，不读取线上数据库，不调用模型，也不将历史验收记录升级为新版本验收结果。

| 想看什么 | 文档 | 更新方式 |
| --- | --- | --- |
| 看懂研究与恢复的业务含义 | [业务流程](BUSINESS_FLOW.md) | 人工 / 编码助手复核；核心文件改变后标为待复核 |
| 当前阶段、模式与具体转移 | [研究流程](WORKFLOW.generated.md) | TypeScript 语法树自动提取 |
| 单 / 多角色依赖、工具、恢复拒绝条件 | [执行与恢复](EXECUTION.generated.md) | TypeScript 语法树自动提取 |
| 模块依赖、API、来源候选 | [结构与接口](ARCHITECTURE.generated.md) | 静态 import、声明和调用自动提取 |
| 文件覆盖与更新状态 | [源文件指纹](manifest.generated.json) | 自动生成 |

## 日常使用

在 `source/` 安装项目依赖后运行：

```sh
pnpm docs:logic
pnpm docs:logic:check
pnpm test:logic-docs
```

生成只解析源码，不执行应用。`*.generated.*` 不手动编辑，重复生成结果保持一致。脚本覆盖 `source/app`、`source/components`、`source/lib`、`source/db` 中的 TS / TSX / MTS / MJS 文件，新增文件也会纳入指纹和结构索引。

## 代码变更后的同步

1. 修改阶段、分支、角色、工具、渠道或恢复机制后，先核对真实代码及差异。
2. 运行生成命令，检查变更后的图和表；不能只刷新指纹而不阅读含义。
3. 若 `review.json` 监控的核心文件发生变化，逐项检查并更新 `BUSINESS_FLOW.md`，记录复核人、结论及相应源码的 SHA-256。候选哈希可以从 `manifest.generated.json` 的 `files` 获取；只在实际复核后复制。
4. 再运行生成和检查，提交源码与文档。生成器不会自动确认人工业务图。

CI 对 push 自动重新生成代码提取文档，并在同一分支提交这些生成文件；对 pull request 只读检查，过期或待人工复核时失败。push 也会执行最终检查，人工业务图过期时仍然失败。fork 的 PR 不写回源分支。

CI 使用独立安装的项目版本 TypeScript，不安装整个应用，不注入业务密钥，不运行真实研究。自动写回依赖仓库允许工作流写入；失败会保留任务失败记录，不能声称已同步。默认分支不要求更新业务数据，也不自动部署。

## 范围与限制

- 这是提交触发的同步，不是监听未保存的本地编辑；CI 完成存在排队和运行延迟。
- 阶段数组只代表界面展示顺序，不把可选补证画成必经步骤。
- 任务依赖不等于并行调度。静态 import 不等于动态调用次数。
- 转移清单保留动态表达式；局部 if 条件不包含所有早退、循环和跨函数路径约束。
- 当前提取器要求部分核心声明保持可识别结构；不支持的改写会明确失败，不保留旧图假装成功。
- 自动检查不是 GitHub 分支保护。是否将此检查设为合并必需项，由仓库设置决定，本次不修改仓库保护规则。
- 不替代浏览器、真实模型、故障恢复或业务结论质量验收。

## 与现成工具的关系

[GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) 提供仓库可视化和技能 / MCP 入口；[Google Code Wiki](https://developers.googleblog.com/en/introducing-code-wiki-accelerating-your-code-understanding/) 提供自动文档与图。它们适合辅助理解仓库。本项目把可确定的事实生成器和提交检查保留在源码内，避免外部索引仍指向旧默认分支时，把旧图当作最新逻辑。

当前没有安装额外的个人技能，也没有把业务源码或凭据发送到新的图表服务。后续编码助手遵循根目录 `AGENTS.md` 的同步规则。
