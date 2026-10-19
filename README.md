# bigyellow12138 生图 MCP

BigYellow 生图中转的 MCP（stdio）。零依赖，Node.js 18+ 即可运行。

只有一个工具 `generate_image`，内置两个模型：

| 模型 | 定位 |
|---|---|
| `gpt-image-2.5-flare` | 快速版，日常出图（默认） |
| `gpt-image-2.5-sunburst` | 精度版，细节与编辑一致性更好 |

支持 `1K / 2K / 4K`（真实 4096×4096）、图生图编辑、多张生成，图片保存到本地并返回路径。

## 快速开始

MCP 客户端里加一段配置，**只需要填自己的令牌**：

```jsonc
{
  "mcpServers": {
    "imagegen": {
      "command": "npx",
      "args": ["-y", "@bigyellow12138/imagegen-mcp"],
      "env": {
        "BIGYELLOW_TOKEN": "sk-你的令牌"
      },
      "timeoutMs": 180000
    }
  }
}
```

如果 npm 上暂时不可用，可以走 GitHub：

```jsonc
"args": ["-y", "github:Vsonic12138/bigyellow12138-imagegen-mcp"]
```

Claude Code / Codex / ZCode / Cursor 都适用。

## 配置项

| 环境变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `BIGYELLOW_TOKEN` | ✅ | — | 生图令牌（`sk-...`，不带前缀会自动补） |
| `BIGYELLOW_BASE_URL` | | 内置 | 中转地址，一般不用填 |
| `IMAGE_OUTPUT_DIR` | | `~/Pictures/bigyellow-images` | 图片保存目录，自动创建 |
| `DEFAULT_MODEL` | | `gpt-image-2.5-flare` | 默认模型 |
| `DEFAULT_QUALITY` | | `high` | 默认质量 |
| `REQUEST_TIMEOUT_MS` | | `180000` | 单次请求超时 |
| `MAX_RETRIES` | | `2` | 429/5xx/1010 自动重试次数 |

## 参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `prompt` | string，必填 | 提示词 |
| `model` | string | `gpt-image-2.5-flare` / `gpt-image-2.5-sunburst`，默认 flare |
| `size` | string | `1K` / `2K` / `4K` / `auto` / `宽x高`，默认 1K |
| `quality` | string | `low` / `medium` / `high` / `xhigh` / `max` / `auto`，默认 high |
| `n` | integer | 生成张数 1–4，默认 1 |
| `images` | string[] | 本地图片路径，传了就走图生图编辑 |
| `outputPath` | string | 可选，指定输出文件路径 |

## 使用示例

```
帮我画一张：雨夜的东京小巷，霓虹灯反射在积水里，电影感，4K
```

```
把 images/photo.png 里人物的背景换成雪山日落，其他保持不变
```

## 常见问题

- **403 / error 1010**：Cloudflare 浏览器完整性检查拦截，需要在站点给 `/v1/*` 放行。
- **超时**：把客户端的 `timeoutMs` 和 `REQUEST_TIMEOUT_MS` 调大；4K 单张可能超过 60 秒。
- **找不到图片**：看返回文本里的完整路径；Windows 默认在 `%USERPROFILE%\Pictures\bigyellow-images`。
- **4K 文件很大**：4096×4096 PNG 约 15–20MB，正常。

## License

MIT
