# dsh-reasoning-autofill

为 DeepSeek Harness（DSH）第三方模型自动补齐推理强度，并在原生模型选择器中显示中英双语档位。

当第三方 OpenAI-compatible provider 的模型没有声明 `reasoningEfforts` 时，DSH 默认不会显示“推理等级”。本插件会自动补齐缺失声明，让用户直接在原来的模型选择器中选择推理强度，无需额外的 UI。

## 功能

- 自动检测 `llm-pi-ai.providers.<provider>.models` 中缺少 `reasoningEfforts` 的模型
- 自动补齐 `Minimal / Low / Medium / High / XHigh / Max` 六档推理强度
- 可选提供 `Off` 档位
- 在 DSH 原生模型选择器中显示中英双语名称
- 监听设置变化，后续新增第三方模型也会自动处理
- 使用 settings revision 合并写入，发生并发冲突时自动重试
- 不覆盖用户已有的自定义 `reasoningEfforts`
- 自动把本插件第一版生成的四档配置迁移为六档

## 推理档位

| Effort ID | 选择器显示 | 含义 |
|---|---|---|
| `off` | Off / 关闭 | 不发送 reasoning 参数 |
| `minimal` | Minimal / 最低 | 最少量推理，通常延迟和消耗最低 |
| `low` | Low / 轻度 | 低强度推理 |
| `medium` | Medium / 中等 | 平衡速度与推理质量 |
| `high` | High / 高 | 较充分推理 |
| `xhigh` | XHigh / 极高 | 比 High 更高的推理强度 |
| `max` | Max / 最高 | 模型或网关允许的最大推理强度 |

> 插件会将 effort ID 原样作为 wire 值发送，例如 `high` 会进入 `reasoning: { effort: "high" }`。第三方网关必须支持所选值，否则请求可能被上游拒绝。

## 环境要求

- 已安装 DeepSeek Harness，且 `dsh web` 可以正常启动
- `dsh plugin` 命令可用
- `pnpm` 已加入 PATH（DSH 使用 pnpm 管理 profile 插件）
- 当前插件面向 `web` profile

## 安装

### 从 GitHub 安装

仓库创建并推送完成后执行：

```powershell
dsh plugin --profile web add github:<你的GitHub用户名>/dsh-reasoning-autofill
```

例如：

```powershell
dsh plugin --profile web add github:example-user/dsh-reasoning-autofill
```

如果 `dsh` 没有加入 PATH，可以在 DSH 安装目录执行：

```powershell
& "D:\deepseek-harness\node_modules\.bin\dsh.cmd" plugin --profile web add github:<你的GitHub用户名>/dsh-reasoning-autofill
```

安装成功后，DSH 会自动：

1. 把插件加入 `~/.dsh/profiles/web/package.json` 的 dependencies
2. 把 `dsh-reasoning-autofill` 追加到 `dsh.profile.bundles`
3. 应用插件自带的 `cordis.patch.yml`

然后重启 `dsh web`（Windows 下可重新运行 start.bat）并刷新页面。

### 本地 link 安装

适合开发或从本地备份恢复：

```powershell
dsh plugin --profile web add link:"C:\path\to\dsh-reasoning-autofill"
```

`link:` 安装指向本地源码，修改代码后无需重新安装，但仍需重启 `dsh web` 才能加载新的 Host 代码。

## 使用方法

### 1. 添加第三方模型

可以通过 DSH 的模型设置页添加，也可以编辑：

- Windows：`C:\Users\<用户名>\.dsh\settings.yaml`
- Linux/macOS：`~/.dsh/settings.yaml`

示例：

```yaml
llm-pi-ai:
  providers:
    maok:
      displayName: maok
      apiKeyEnv: MAOK_API_KEY
      api: openai-responses
      baseURL: https://example.com/v1
      models:
        - id: gpt-example
          name: GPT Example
```

### 2. 启动 DSH

```powershell
dsh web
```

插件会自动把上面的模型补齐为：

```yaml
models:
  - id: gpt-example
    name: GPT Example
    reasoningEfforts:
      off: null
      minimal: minimal
      low: low
      medium: medium
      high: high
      xhigh: xhigh
      max: max
```

### 3. 选择推理强度

打开对话输入区的模型选择器：

1. 选择第三方 provider 和模型
2. 进入“推理等级”
3. 选择 `Off / Minimal / Low / Medium / High / XHigh / Max`
4. 新选择会作为当前会话的 `reasoningEffort` 发送

## 插件配置

插件注册了 `reasoning-autofill` 设置段。可以从 DSH 设置页修改，也可以直接编辑 settings.yaml：

```yaml
reasoning-autofill:
  defaultLevels:
    - minimal
    - low
    - medium
    - high
    - xhigh
    - max
  includeOff: true
  skipRoutes: []
  skipModels: []
```

### 配置字段

| 字段 | 默认值 | 说明 |
|---|---|---|
| `defaultLevels` | `[minimal, low, medium, high, xhigh, max]` | 自动补写的推理档位，不包含 Off |
| `includeOff` | `true` | 是否添加 `off: null` |
| `skipRoutes` | `[]` | 完全跳过的 provider 路由名 |
| `skipModels` | `[]` | 跳过的具体模型，格式为 `provider/modelId` |

跳过示例：

```yaml
reasoning-autofill:
  skipRoutes:
    - provider-without-reasoning
  skipModels:
    - maok/gpt-example-lite
```

### 网关只支持部分档位

如果第三方网关只支持 `low / medium / high`，建议配置为：

```yaml
reasoning-autofill:
  defaultLevels:
    - low
    - medium
    - high
  includeOff: true
```

不要向不支持 `xhigh` 或 `max` 的网关发送对应值。

## 更新插件

GitHub 安装方式：

```powershell
dsh plugin --profile web update dsh-reasoning-autofill
```

更新完成后重启 `dsh web` 并刷新页面。

本地 `link:` 安装方式不需要执行 update；更新本地源码后直接重启 DSH。

## 验证安装

检查插件是否进入 profile 合成树：

```powershell
dsh --profile web --dump-config | Select-String reasoning-autofill
```

正常情况下应看到：

```text
- id: reasoning-autofill
  name: dsh-reasoning-autofill
```

运行插件自检：

```powershell
node test.mjs
node sim.mjs
```

## 常见问题

### 安装后没有显示推理等级

1. 确认已重启 `dsh web`
2. 刷新浏览器页面并重新打开模型选择器
3. 检查模型是否位于 `llm-pi-ai.providers.<provider>.models` 数组中
4. 使用 `--dump-config` 确认插件已加载
5. 检查 settings.yaml 中该模型是否出现 `reasoningEfforts`

### 没有显示 XHigh 或 Max

当前版本会自动迁移第一版插件生成的四档配置。如果仍未出现：

1. 重启 `dsh web`
2. 检查 `reasoning-autofill.defaultLevels` 是否包含 `xhigh` 和 `max`
3. 检查模型是否有用户自定义的 `reasoningEfforts`；插件不会覆盖自定义声明

### 选择 XHigh 或 Max 后请求失败

表示当前第三方模型或网关不接受对应 wire 值。请从 `defaultLevels` 和模型已有的 `reasoningEfforts` 中移除该档位，或查阅网关文档确认其实际参数。

### 中英双语名称没有生效

双语名称在插件加载时包装 DSH 的模型信息出口。修改或更新插件后必须重启 `dsh web`，仅刷新浏览器不够。

## 卸载

```powershell
dsh plugin --profile web rm dsh-reasoning-autofill
```

卸载后重启 `dsh web`。

卸载插件不会删除已经写入 settings.yaml 的 `reasoningEfforts`。因此：

- 插件不会再自动处理新模型
- 中英双语显示名不再由插件提供
- 已有模型仍可能显示推理档位

如需完全恢复，请手动删除：

- `reasoning-autofill` 设置段
- 各模型下由插件写入的 `reasoningEfforts`

## 配置写入与安全性

- 插件只读取和更新 DSH 的 `llm-pi-ai` 设置段
- 插件不会读取、记录或上传 API Key
- 插件不会发送网络请求
- 插件不会修改 prompt、消息内容或模型输出
- 除第一版插件生成的精确四档配置外，已有自定义 `reasoningEfforts` 不会被覆盖

## 工作原理

1. 从 `ctx.settings.describe()` 读取 `llm-pi-ai` 的原始用户设置层
2. 遍历 provider 的显式 `models` 数组
3. 为缺少 `reasoningEfforts` 的模型生成档位映射
4. 使用 `ctx.settings.update()` 和 revision 合并写回
5. pi-ai 适配器实时重建模型描述和请求校验能力
6. 包装 `ctx.llm.resolveModelInfo()`，将 effort 显示名转换为中英双语

## 项目结构

```text
dsh-reasoning-autofill/
├── lib/
│   └── index.js          # 插件主逻辑
├── cordis.patch.yml      # DSH bundle 挂载层
├── package.json          # 插件清单与依赖
├── README.md             # 使用文档
├── test.mjs              # 单元自检
└── sim.mjs               # Cordis 运行时仿真
```

## 开发

```powershell
git clone https://github.com/<你的GitHub用户名>/dsh-reasoning-autofill.git
cd dsh-reasoning-autofill
pnpm install
node test.mjs
node sim.mjs
```

本地调试安装：

```powershell
dsh plugin --profile web add link:"$PWD"
```

## License

MIT
