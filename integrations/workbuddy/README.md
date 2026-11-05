# 见微 WorkBuddy 适配

原生专家候选代码已补齐，源码位于 expert/。它不接入作者共享数据库，也不包含网页版账号系统。
版本0.1.0；作者公开邮箱尚待填写。当前是审阅候选，未声称通过WorkBuddy解析、实测或审核。

## 构建与检查
```sh
python3 -m unittest discover -s integrations/workbuddy/tests -v
python3 integrations/workbuddy/package.py --output dist/jianwei-workbuddy-review-0.1.0.zip
```
ZIP根目录直接包含.codebuddy-plugin/plugin.json、agents/、avatars/、scripts/、references/和templates/，没有额外仓库或专家文件夹包裹层。
头像由标准库生成的原创插画，512×512 PNG；不依赖在线图片或第三方授权。

正式包由发布者提供公开作者邮箱后构建，示例中参数应替换为本人确认的公开信息：
```sh
python3 integrations/workbuddy/package.py --release --author-email "$JIANWEI_PUBLIC_AUTHOR_EMAIL" --output dist/jianwei-workbuddy-0.1.0.zip
```
作者邮箱会写进公开包，请不要填私密凭据。空值、占位邮箱会阻止正式构建。
每次构建输出SHA256和checks.json；客户端安装、工具实测和语义验收始终单列。

## 内容
- expert/agents/jianwei-research.md：澄清、取证、反证、验证计划与恢复指令。
- expert/scripts/audit.py：本地逐字引文、版本与分句覆盖检查及基础报告输出。
- acceptance.md：真实平台验收输入和放行门槛。
- ACCOUNT_MEMORY_ENTITLEMENTS.md：账号、账户记忆和免费/付费功能设计及尚未实现的后台条件。

GitHub Actions运行合成离线测试并生成审阅ZIP，不使用生产secret或真实模型。市场发布、价格、变现签约和协议选择均不自动提交。
平台免费和付费环境的工具/文件能力需分别实测；后续公开账号后台不是本包已经交付的能力。
