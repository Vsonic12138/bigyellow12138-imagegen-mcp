# bigyellow12138 生图 MCP

一个零依赖的 stdio MCP，用来**生成图片**和**编辑图片**。

- 默认内置 BigYellow 中转，也可以指向任意 **OpenAI 兼容** 的中转地址
- 两个模型：`gpt-image-2.5-flare`（快）、`gpt-image-2.5-sunburst`（精度高）
- 尺寸：`1K` / `2K` / `4K`（真实 4096×4096）/ `auto` / 自定义 `宽x高`
  - 注意：`1K/2K/4K` 是**正方形**预设（1024²、2048²、4096²）
  - 要竖图/横图比例，传 `宽x高`，比如 `1536x2048`
  - 改图时不传 `size`，会自动沿用原图尺寸
- 质量：`low` / `medium` / `high` / `xhigh` / `max` / `auto`
- 支持图生图/编辑：把本地图片路径放进 `images[]`
- 生成后保存到本地，返回绝对路径

## 快速开始

### 默认中转（只填令牌）

```jsonc
{
  "mcpServers": {
    "imagegen": {
      "command": "npx",
      "args": ["-y", "@bigyellow12138/imagegen-mcp"],
      "env": {
        "IMAGE_API_TOKEN": "sk-你的令牌"
      },
      "timeoutMs": 180000
    }
  }
}
```

### 换成其他中转

```jsonc
"env": {
  "IMAGE_API_TOKEN": "sk-对方中转的令牌",
  "IMAGE_API_BASE_URL": "https://对方中转域名/v1"
}
```

`IMAGE_API_BASE_URL` 不带 `/v1` 会自动补；带 `/v1` 就用原样。只要对方兼容 OpenAI 的 `/v1/images/generations` 和 `/v1/images/edits` 就能用。

## 配置项

| 环境变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `IMAGE_API_TOKEN` | ✅ | — | 中转令牌（`sk-...`，不带前缀会自动补） |
| `IMAGE_API_BASE_URL` | | 内置 BigYellow 地址 | 任意 OpenAI 兼容中转，例如 `https://example.com/v1` |
| `IMAGE_OUTPUT_DIR` | | 见下方“保存位置” | 图片保存目录，自动创建 |
| `DEFAULT_MODEL` | | `gpt-image-2.5-flare` | 默认模型 |
| `DEFAULT_QUALITY` | | `high` | 默认质量 |
| `REQUEST_TIMEOUT_MS` | | `180000` | 单次请求超时 |
| `MAX_RETRIES` | | `2` | 429/5xx/1010 自动重试次数 |

> 兼容旧变量名：`BIGYELLOW_TOKEN` / `BIGYELLOW_BASE_URL` 仍然可用。

## 图片保存位置

按优先级：

1. 调用时传 `outputDir` → 存到该目录
2. 配了 `IMAGE_OUTPUT_DIR` → 用它
3. 客户端**在项目目录里启动 MCP**（进程 cwd 是项目路径）→ 存到 `<项目>/ai-images`
4. 以上都没有 → `~/Pictures/bigyellow-images`

> 说明：Claude Code / Codex / Cursor 一般会把项目目录作为 MCP 进程的 cwd，所以默认会存进项目；
> Harness（DSH）的 cwd 固定在 `~/.dsh/profiles/desktop`，因此会回退到用户图片目录。
> 在 Harness 里想存进项目，配 `IMAGE_OUTPUT_DIR` 或让模型传 `outputDir` 即可。

## 工具参数（`generate_image`）

| 参数 | 类型 | 说明 |
|---|---|---|
| `prompt` | string，必填 | 描述要画什么；有 `images` 时写编辑指令：明确“改什么”+“什么必须保持不变” |
| `model` | string | `gpt-image-2.5-flare`（快，默认）/ `gpt-image-2.5-sunburst`（精度高） |
| `size` | string | `1K` / `2K` / `4K` 是正方形预设；比例不同请传 `宽x高`（如 `1536x2048`）；改图不传时沿用原图尺寸 |
| `quality` | string | `low` / `medium` / `high` / `xhigh` / `max` / `auto`，默认 high |
| `n` | integer | 生成张数 1–4，默认 1 |
| `images` | string[] | 本地图片路径，传了就走图生图编辑 |
| `outputDir` | string | 可选，指定保存目录（适合让图片进入当前项目） |
| `outputPath` | string | 可选，指定第一张图的输出路径 |

## 改图的正确写法

编辑是**重新生成**，不是像素级修改，所以提示词要同时写清楚两件事：

1. **改什么**：例如「把背景换成雪山日落」
2. **什么必须不变**：例如「人物、姿势、服装、构图保持不变」

建议：

- 一次只改一个点，改完再继续下一轮
- 精细改图优先用 `gpt-image-2.5-sunburst`
- 需要保持原图比例时，直接不传 `size`（会自动沿用原图尺寸）

## 使用示例

```
帮我画一张：雨夜的东京小巷，霓虹灯反射在积水里，电影感，4K
```

```
把 images/photo.png 里人物的背景换成雪山日落，其他保持不变
```

```
用 sunburst 模型，把这张图的产品换成磨砂黑材质，保持构图不变
```

## 常见问题

- **403 / error 1010**：Cloudflare 浏览器完整性检查拦截，需要在站点给 `/v1/*` 放行。
- **超时**：把客户端 `timeoutMs` 和 `REQUEST_TIMEOUT_MS` 调大；4K 单张可能超过 60 秒。
- **找不到图片**：看返回文本里的完整路径；Windows 默认在 `%USERPROFILE%\Pictures\bigyellow-images`。
- **4K 文件很大**：4096×4096 PNG 约 15–20MB，正常。
- **换中转后报 404**：确认对方支持 `/v1/images/generations` 和 `/v1/images/edits`，以及 `IMAGE_API_BASE_URL` 是否包含了正确的路径前缀。

## License

MIT
