# Cursor 本地运行与配置

以下命令来自当前源码脚本。原工作环境验证使用 Node `v24.19.0`、pnpm `11.25.0`。建议本地使用 Node 24；测试使用 `node:sqlite` 和 `registerHooks`，不要仅按 package.json 的较低 Node 最小值选择旧版本。

## 安装与离线检查

在 Cursor 打开解压后的交接包，终端进入 `source/`：

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
node tests/run-local-api.mjs
pnpm exec tsc --noEmit
pnpm run build
```

如未安装 pnpm，使用本机已有包管理方式安装/启用精确版本 `11.25.0`。不要转用 npm 重新生成锁文件。源项目的 install:ci 使用 Linux flock/timeout 与专用缓存；Cursor 本地安装使用上面的普通 pnpm 路径。首次安装需要访问包仓库；包不包含依赖下载缓存。

干净源码没有 `.sites-runtime/execution-profile.json`，默认选择 portable，调用 Vinext CLI；这是预期行为。不要复制原机器的 managed-linux 设置、绝对路径或运行态缓存。依赖安装/构建问题先记录实际错误及系统信息，不要删锁文件或静默降级依赖。

离线测试无需 API Key，也不调用 Qwen 或真实 HN，预期 202 行 PASS。生产构建已在原托管环境通过；本机操作系统和网络条件的安装、启动仍需 Cursor 实测，不能把原环境结果写成本机已经验证。

## 初始化本地数据库

构建成功后，首次创建本地数据库执行：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_stormy_archangel.sql
pnpm start
```

这使用 `.wrangler/state` 中的本地 D1，不操作线上数据库。启动地址以终端为准。已有数据库不要重复执行首张表的建表脚本；后续表结构修改才运行 `pnpm run db:generate` 并应用对应新迁移。源码配置内 `00000000-0000-4000-8000-000000000000` 是本地占位 ID，不能当成真实生产 D1 ID。

先使用虚构演示/模拟执行检查网页，不配置 Key 也能验证核心流程。`pnpm dev` 可用于迭代；开发模式若使用另一持久化目录，要在对应目录单独初始化数据库，不能假设与 pnpm start 共用状态。

## 本地真实模型（默认关闭）

线上 Key 不随包导出，原站点已经配置无需再填；Cursor 本地需由用户在本机服务端环境单独提供。包内 `local-config/.dev.vars.example` 只有空占位与 false。按当前 Wrangler 运行模式把本地文件置于它实际读取的配置目录，注意构建后的配置在 `dist/server/`：

- Vite/开发模式通常使用 source 根的 `.dev.vars`，以启动日志及配置状态为准。
- 使用 `pnpm start` 的生成配置时，可在 `dist/server/.dev.vars` 设置本地 Worker 变量；重新构建可能覆盖 dist，应重新检查配置状态。
- 不只放入普通前端 `.env` 就假设已生效：应用从 `cloudflare:workers` 的 env 读取。
- 创建文件前扩充本地忽略规则，确保 `.dev.vars*`、Key 和日志不会提交；现有 `.gitignore` 没有通用忽略所有 `.dev.vars*`。

变量只有：`DASHSCOPE_API_KEY`（服务端 secret）与 `QWEN_FREE_TIER_ONLY_CONFIRMED`（字符串 false/true）。仅在百炼 qwen3.7-plus 免费额度仍有效、“免费额度用完即停”已开启并生效后设置 true；应用不能读取保护开关或额度，true 只是确认。

固定公共配置在 `lib/research/provider-config.ts`：北京、qwen3.7-plus、自定义 Base URL `https://llm-feayjgruj6xxgtqa.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`。不要提供浏览器可修改的任意 URL 或把 Key 放入 NEXT_PUBLIC_*。

刷新网页模型配置状态只读且不生成；HEAD 传输诊断不验证鉴权。要验证完整四角色，新轮明确最多 4 请求、关闭补搜、复用已有冻结原文；失败即停，不要额外 hello、切换付费模型或自动重试。

## 线上发布与迁移

原站点的私有权限、真实 D1 和服务端 secret 由 Sites 控制面配置，不在源码包中。Cursor 不自动获得原站点发布能力。需要继续原站点时，交回代码变更，再使用有权限的托管发布流程；不要尝试复用临时登录/仓库令牌。

迁移到用户自己的 Cloudflare 或独立后端属于后续工程：先配置真实资源和服务端密钥、保留登录授权/数据隔离，再做数据库迁移及部署验证。当前本地模拟登录不能用于公开生产部署；直接把构建输出上传其他平台不会自动继承原站点的所有者私有保护。

当前单角色/四角色请求仍由网页推进并保存检查点，关闭页面不保证自动后台完成。恢复需网页重开并读取最新版本。可靠后台任务见路线图。
