# 工程交接约束

适用本交接包。应用源码在 source/；变更前阅读根目录交接文档，保留 source 内现有锁文件与构建配置。

- 默认使用模拟/离线测试。没有用户指定的真实验收安排不调用真实模型；不导出或索取原线上 secret。
- 不增加隐式重试、绕过预算、修改已花费次数、伪造请求回执或自动切换模型。
- 不宽松接受无效引用，不修补历史被拒输出。新 wire 的确定性引用生成与旧引用失配必须区分。
- 保持 CAS、幂等、lease、输入版本、项目权限和迟到结果边界；新增恢复功能应写相应有意义的故障回归。
- 经验与模型反思不得自动晋升为已验证事实；独立反证首轮保持盲核查。
- 修改完成运行适当检查；核心契约改动运行 tests/run-local-api.mjs、类型检查和生产构建。报告实际结果及尚待真实验证的事项。
- 当前托管站点是私有单用户，不把本地 mockAuth 部署到公开环境。迁移前先建立授权和资源隔离。
- 更新日期化的验收记录。不得把模拟流程通过、单角色成功或原文可定位误称为真实四角色完成或市场结论正确。

## Cursor Cloud specific instructions

Node `v24.19.0` and pnpm `11.25.0` are installed at `/usr/local/lib/node-v24.19.0-linux-x64`. Login shells resolve `node` and `pnpm` to that toolchain. `node tests/run-local-api.mjs` needs `module.registerHooks` from this Node version.

From `source/`:

- `pnpm install --frozen-lockfile`
- `node tests/run-local-api.mjs` (no model key; do not call Qwen)
- `pnpm exec tsc --noEmit`
- `pnpm dev` serves http://127.0.0.1:5173/
- Local D1 uses `drizzle/0000_stormy_archangel.sql` under `.wrangler/state/v3`. Apply that file only when `research_projects` is missing.

The `ai-shopping-assistant-h5` repository runs with `npm ci` and `npm run dev` on port 3000. Set `COZE_WORKFLOW_USE_MOCK=1` so chat uses the local mock. Demo login is `guide01` / `demo123`. `npm run lint` and `npx tsc --noEmit` succeed. `npm run build` currently fails while prerendering (`TypeError: a[d] is not a function` in the Next.js webpack runtime); that failure is in the app build, and the dev server still serves the mock chat flow.
