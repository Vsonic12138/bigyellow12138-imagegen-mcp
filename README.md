# newapi-imagegen-mcp

给 NewAPI 中转用的生图 MCP（stdio）。零依赖，Node.js 18+ 即可运行。

只暴露一个工具 `generate_image`，内置两个模型：

| 模型 | 定位 |
|---|---|
| `gpt-image-2.5-flare` | 快速版，日常出图（默认） |
| `gpt-image-2.5-sunburst` | 精度版，细节与编辑一致性更好 |

支持 `1K / 2K / 4K`（真实 4096×4096）、图生图编辑、多张生成，图片直接保存到本地并返回路径。

## 快速开始

在 MCP 客户端里加一段配置，**只需要填自己的令牌**：

```jsonc
{
  "mcpServers": {
    "imagegen": {
      "command": "npx",
      "args": ["-y", "github:Vsonic12138/newapi-imagegen-mcp"],
      "env": {
        "NEWAPI_TOKEN": "sk-你的令牌"
      },
      "timeoutMs": 180000
    }
  }
}
```

> `timeoutMs` 建议 180000（生图通常 20–60 秒，4K 更久）。

Claude Code / Codex / ZCode / Cursor 都适用；如果客户端不支持 `github:` 安装，可以克隆后直接跑：

```bash
git clone https://github.com/Vsonic12138/newapi-imagegen-mcp
cd newapi-imagegen-mcp
NEWAPI_TOKEN=sk-xxx node index.js
```

## 配置项

| 环境变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `NEWAPI_TOKEN` | ✅ | — | NewAPI 令牌（`sk-...`，不带前缀也会自动补） |
| `NEWAPI_BASE_URL` | | `https://newapi.vsonic12138.shop/v1` | 中转地址；不带 `/v1` 会自动补 |
| `IMAGE_OUTPUT_DIR` | | `~/Pictures/newapi-images` | 图片保存目录，不存在会自动创建 |
| `DEFAULT_MODEL` | | `gpt-image-2.5-flare` | 默认模型，可选 flare / sunburst |
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

- **403 / error 1010**：Cloudflare 浏览器完整性检查拦截。在站点给 `/v1/*` 放行（本项目已在 NewAPI 侧配置规则）。
- **超时**：把客户端的 `timeoutMs` 和 `REQUEST_TIMEOUT_MS` 调大；4K 单张可能需要 60 秒以上。
- **找不到图片**：先看返回文本里的完整路径；Windows 默认在 `%USERPROFILE%\Pictures\newapi-images`。
- **4K 文件很大**：4096×4096 的 PNG 约 15–20MB，属于正常现象。

## License

MIT
