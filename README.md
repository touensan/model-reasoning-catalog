# Model reasoning catalog

Android 客户端使用的独立公开推理能力目录。`catalog.json` 可以直接加载，不需要安装 DSH 或任何服务。

参考并保留 [liucaimao2026/dsh-reasoning-autofill](https://github.com/liucaimao2026/dsh-reasoning-autofill) 的原始代码、历史与 MIT 许可证；原插件文档在 UPSTREAM_README.md。Android 不依赖原插件及其 npm 包。

## 规则与默认

优先使用供应商报告或用户填写的档位；缺失时用目录精确 ID / 最长前缀匹配。模型 ID 忽略大小写与路由前缀（例如 `openai/gpt-6-luna`）。特定 providerHost 规则优先于通用规则。

新选择默认 medium；不接受 medium 的模型使用该规则声明的有效 defaultEffort。已保存的对话模型与有效档位保留。已知不支持推理的模型可以声明空 efforts，不发送无效参数。

fallback 的 low / medium / high 是兼容模板，不能证明任意网关支持这些值；遇到特殊模型添加规则，或在 App 的供应商设置里填写实际支持的档位。Fast 由远端实际能力决定，本目录不猜测 Fast 支持。

GPT-6.1 Sol、GPT-6 Astra/Sol、GPT-5.6 Sol/Terra 的 Codex 兼容模板包含 Ultra；Luna 仍保留原档位。直接 API 模式原样发送 `ultra`，能否接受由网关决定，不会因此获得 Codex 的任务委派能力。供应商明确报告的档位仍优先。

## 新增规则

在 rules 中添加 ids（精确 ID）或 prefixes（模型前缀），efforts（允许的 wire 值），defaultEffort（必须在 efforts 里），source（官方证据或明确标注兼容模板）；可添加 providerHost 限定端点。不要写入 API 密钥、账户、供应商私有地址或聊天内容。不要用空字符串作前缀。保留 schemaVersion: 1。

## 加载与验证

公开地址：https://raw.githubusercontent.com/touensan/model-reasoning-catalog/main/catalog.json

App 内置一份相同 JSON；缓存更新每天最多一次成功更新，下载超时或 JSON 无效时保留已有配置。仅下载静态数据，没有远程执行代码。

`revision` 是目录内容版本（旧目录缺失时按 1 处理）；修订规则时递增。App 优先使用不低于内置修订号的缓存，并拒绝网络更新降级，避免升级后旧缓存继续遮住新增档位。

运行 `node check-catalog.mjs` 验证规则。原 DSH 插件仍可独立使用，见 UPSTREAM_README.md。
