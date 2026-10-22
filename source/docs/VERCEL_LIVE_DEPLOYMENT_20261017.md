# Vercel 首次部署记录（2026-10-17）

- 项目：`jianwei`；团队：`stella-s-projects88`。
- 来源：本地迁移提交 `6aab2f4` 的 `source` 代码包，通过 Vercel 网页 Drop to Deploy 上传；未写入公开 GitHub 仓库。
- 云端页面确认部署成功；访问地址：`https://jianwei-three.vercel.app/`。
- 云端日志确认：pnpm 11.25.0 完成依赖安装，Next.js 16.3.4 webpack 编译成功，TypeScript 完成，静态页面 6/6 生成，随后页面显示部署成功。
- 首页与 `/api/projects` 实际访问均返回未配置 `JIANWEI_ACCESS_PASSWORD` 的关闭提示。访问保护没有通过虚构身份放行。
- 生产环境已单独保存 `QWEN_FREE_TIER_ONLY_CONFIRMED=true`；在首次构建开始后添加，需后续重新部署才能生效。
- 生产数据库 URL/令牌、模型密钥、访问密码尚未配置；Turso 数据库与表尚未创建。研究功能尚不可用，历史 D1 资料未迁移。
- 实际模型调用 0，未开通付费资源，原托管站点未改动。

## 后续步骤

1. 所有者在 Vercel 私下填写 `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`、`DASHSCOPE_API_KEY`、`JIANWEI_ACCESS_PASSWORD`，均保存为生产环境 Secret；密码至少 24 字符，登录用户名 `owner`。不通过聊天收集密钥，不从原站点导出。
2. 若没有 Turso 数据库，先完成独立数据库的开通与授权，再填写真实连接值，不能用占位符或空值代替。
3. 初始化 `research_projects` 表，保留版本条件写入规则。历史资料另行通过私有通道迁移。
4. 全部配置后重新部署，再验证未登录拦截、登录后的项目保存/删除/并发冲突、以及已确认免费额度内的真实研究。

部署构建成功只证明代码能够在 Vercel 构建发布，不代表数据库迁移或真实研究全流程已经验收。

## 后续配置进展（2026-10-17，北京时间）

- 已通过控制台确认用户完成 Turso 登录，组织为 Free 套餐；创建独立 `jianwei-production` libSQL 数据库，区域 AWS US East (Virginia)。未升级付费套餐。
- 在该库 SQL 控制台执行与 `scripts/init-vercel-db.mjs` 一致的 `CREATE TABLE IF NOT EXISTS research_projects`，随后查询 `sqlite_master` 返回 1 行并显示对应表结构，确认建表成功。没有写入研究项目或迁移旧 D1 数据。
- Vercel 页面确认已保存 `DASHSCOPE_API_KEY`、`JIANWEI_ACCESS_PASSWORD` 和免费额度确认项；仅查看名称及类型，没有读取值。用户批量导入还包含导购项目配置；未删除或调用那些服务。API 密钥目前被导入为 Config，后续应由所有者改存 Secret。
- 已将新数据库连接地址保存为 Vercel Production Secret；没有在本记录中保留连接地址或令牌。
- 尚缺 `TURSO_AUTH_TOKEN`。已准备 Production Secret 的空白填写表单，待所有者在 Turso 为此独立库生成读写令牌并直接保存到 Vercel；不经聊天传递或读取令牌。
- 仍未重新部署；新环境变量尚不代表原部署已经生效。登录后的应用读写、真实模型和完整流程尚未验收。本轮新增真实模型调用 0。

## 令牌保存后的重新部署与入口核查

- 已通过 Vercel 设置页确认五项必需变量均存在；数据库 URL、数据库令牌和访问密码均为 Production Secret。只核对名称、类型和环境，未读取值。
- 使用原上传代码的同一份源码、最新 Project Settings、Production 环境发起重新部署，未使用旧构建缓存。新部署 `9AqeZYktHyEks8YgRCQKAhfuKyHp` 页面确认 Ready，耗时 2 分 16 秒，生产域名分配成功；编译、TypeScript 和静态页面生成通过。
- 发布就绪后刷新正式首页，仍返回 `部署尚未完成：请在服务端配置至少 24 字符的 JIANWEI_ACCESS_PASSWORD。`。此提示对应服务端密码缺失或不足 24 个字符；不能从只读元数据判断实际值。Production Secret 范围已再次确认，不因变量名称存在而声称凭据有效。
- 按验证的首个阻断边界停止：尚不能验证登录、项目 CRUD 或数据库令牌权限，也未发起模型请求。已打开密码变量 Edit 表单，交由所有者本人替换为至少 24 字符的访问密码并保存，之后需再次重新部署。
- 未读取、更改或放宽密码校验，未删除任何导入配置；本轮新增真实模型调用 0，付费资源升级 0。

## 所有者更新密码后的复查与诊断修订

- Vercel 页面确认密码更新已保存，再次以 Production、最新项目设置、无构建缓存重新部署同一上传源码。部署 `8HwR2EEL2q5hbafKRDRjSaGwDS3U` 显示 Ready，耗时 2 分 22 秒；正式域名分配成功。
- 正式首页和该部署独立地址均仍显示原合并提示。只能确定云端访问配置检查未通过，尚不能区分环境变量缺失与内容不足最低长度；不能据此继续认定所有者没有正确更新密码。
- 云端资源显示 `/_middleware` 为 Node.js 24.x，API 函数位于 IAD1；没有通过关闭保护放行请求。
- 将 `DASHSCOPE_API_KEY` 从 Config 转为 Secret，保留原值、原环境范围；界面确认更新成功。没有读取、输入或导出密钥值，没有操作其他导购配置。该类型调整发生在本轮构建启动后，后续新代码部署会采用最新设置。
- `private-proxy.ts` 对原 503 配置失败新增 `ACCESS_PASSWORD_MISSING` 与 `ACCESS_PASSWORD_TOO_SHORT` 原因代码和相应操作说明。仍无密码内容、精确长度、片段或散列；有效密码仍需至少 24 字符，未登录仍为 401，跨来源写入仍为 403。诊断修订尚未部署。
- 验证：完整 D1 边界 501 PASS、Turso HTTP/实际内存 SQLite 边界 501 PASS；最终类型检查、Next webpack 生产构建通过；同一新构建分别以缺失、过短、合格的虚构运行时密码启动，3 组实际 HTTP 检查通过，包含 UI/API 503 原因代码、401 登录挑战、正确凭据首页 200 与跨来源写入 403。无云端数据库或真实模型请求。
- 首次并行检查日志只完成 408 项，不能按上一轮计数宣称全套通过；串行补跑后已在日志中确认末尾 `vercel_target_checks:15` 与 501 条 PASS。早先与构建并行的 tsc 因 `.next/types` 重建返回 TS6053，构建结束后重跑类型检查通过。
- 当前网页 Redeploy 只能复用已上传旧源码。已安装固定版本 Vercel CLI 64.0.2 并发起官方设备登录，待所有者授权；授权页 Allow Access 暂不可用，未擅自点击或放宽权限。尚未写入公开 GitHub，未再次创建项目，真实模型调用仍为 0。