# Archify 交互架构图

本项目采用 [tt-a1i/archify](https://github.com/tt-a1i/archify) 渲染交互式架构图。`candidate.json` 是经过源码核对的图定义；它不是 Mermaid 换皮，也不是自动推测的调用图。

图展示新研究在 Node / Turso 部署中的主要责任关系：工作台、工作流控制器、研究执行保障、模型、证据工具、公开渠道、校验草稿及持久化。可点击节点查看固定提交的源码，切换深浅主题，查看关系和导出图片。旧执行器和 Cloudflare / D1 路径仅在说明卡中提示。

## 查看

GitHub 不直接运行仓库里的交互 HTML。在仓库 Actions 中打开成功的 **Logic documentation** 任务，下载 `jianwei-archify` 产物，解压后用浏览器打开其中的 `jianwei-architecture.html`。交付对话会另外提供可直接下载的 HTML。

## 与代码保持一致

- 提交代码后，原有脚本更新可直接提取的流程与依赖事实。
- Archify 定义及其引用源码纳入复核指纹。被引用的代码改变后，需要编码助手核对组件责任、关系、条件和行号，再更新固定提交及复核记录。
- 渲染脚本另将当前文件与图中固定提交的原始字节比较；不一致就停止，不能只刷新指纹生成旧图。
- 校验通过后，CI 使用固定版本的官方 Archify 完成布局、来源、HTML 和浏览器检查，生成新交互文件。工具失败或缺少浏览器时保持失败状态。
- 这不是让 Archify 在后台自主理解任意业务改动；语义变更仍由编码助手按 `AGENTS.md` 核对，自动检查负责暴露遗漏。

## 本地生成

先取得官方 Archify，再将 `JIANWEI_ARCHIFY_CLI` 指向它的 `archify/bin/archify.mjs`。在 `source/` 执行：

```sh
pnpm docs:logic
pnpm docs:logic:check
pnpm docs:archify
```

完整验收需要 Chrome / Chromium 或 Microsoft Edge。可用 `ARCHIFY_CHROME` 指定浏览器路径。缺少浏览器时可能已产生通过结构检查的 HTML，但不能把返回的非零状态称为完整验收通过。

CI 当前固定工具提交为 `d6059331abbddb49bca380ff46dca8ce33158b04`，不会自动更新第三方技能或调用模型。输出保存在 `.archify/`，由 Actions 作为产物提供，不将大型运行态文件写回源码。
