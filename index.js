#!/usr/bin/env node
/**
 * bigyellow12138-imagegen-mcp
 *
 * Zero-dependency MCP (stdio) server for the BigYellow image relay.
 * Models: gpt-image-2.5-flare (fast) / gpt-image-2.5-sunburst (fidelity).
 *
 * Required env:
 *   BIGYELLOW_TOKEN       生图令牌（sk-... 或裸 key）
 * Optional env:
 *   BIGYELLOW_BASE_URL    默认已内置，无需填写
 *   IMAGE_OUTPUT_DIR   default ~/Pictures/bigyellow-images
 *   DEFAULT_MODEL      gpt-image-2.5-flare (default)
 *   DEFAULT_QUALITY    high (default)
 *   REQUEST_TIMEOUT_MS 180000 (default)
 *   MAX_RETRIES        2 (default)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createInterface } from 'node:readline';

const VERSION = '0.1.0';
const DEFAULT_BASE = 'https://newapi.vsonic12138.shop/v1';
const MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'];
const MODEL_ALIASES = {
  flare: 'gpt-image-2.5-flare',
  fast: 'gpt-image-2.5-flare',
  'gpt-image-2.5-flare': 'gpt-image-2.5-flare',
  sunburst: 'gpt-image-2.5-sunburst',
  quality: 'gpt-image-2.5-sunburst',
  'gpt-image-2.5-sunburst': 'gpt-image-2.5-sunburst',
};
const QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'];
const SIZE_PRESETS = { '1K': '1024x1024', '2K': '2048x2048', '4K': '4096x4096', auto: 'auto' };
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function logErr(...args) {
  process.stderr.write(`[bigyellow-imagegen] ${args.join(' ')}\n`);
}

function defaultOutputDir() {
  return path.join(os.homedir(), 'Pictures', 'bigyellow-images');
}

function resolveConfig() {
  const rawToken = (process.env.BIGYELLOW_TOKEN || process.env.OPENAI_API_KEY || '').trim();
  let base = (process.env.BIGYELLOW_BASE_URL || DEFAULT_BASE).trim().replace(/\/+$/, '');
  if (!/\/v1$/i.test(base)) base += '/v1';
  const quality = String(process.env.DEFAULT_QUALITY || 'high').toLowerCase();
  return {
    token: rawToken && !rawToken.startsWith('sk-') ? `sk-${rawToken}` : rawToken,
    base,
    outputDir: process.env.IMAGE_OUTPUT_DIR || defaultOutputDir(),
    timeoutMs: Math.max(10000, Number(process.env.REQUEST_TIMEOUT_MS || 180000)),
    retries: Math.max(0, Number(process.env.MAX_RETRIES || 2)),
    defaultModel: MODEL_ALIASES[String(process.env.DEFAULT_MODEL || '').toLowerCase()] || 'gpt-image-2.5-flare',
    defaultQuality: QUALITIES.includes(quality) ? quality : 'high',
  };
}

const CONFIG = resolveConfig();

const TOOL = {
  name: 'generate_image',
  description:
    'Generate a new image or edit existing images through the BigYellow image relay. ' +
    'Models: gpt-image-2.5-flare (fast, everyday) and gpt-image-2.5-sunburst (highest fidelity for edits). ' +
    'Saves the result to disk and returns the file path. Pass local file paths in images[] to edit.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Prompt describing the image to generate or the edit to apply.' },
      model: {
        type: 'string',
        enum: MODELS,
        description: 'gpt-image-2.5-flare is faster; gpt-image-2.5-sunburst is better for precise edits. Default: flare.',
      },
      size: {
        type: 'string',
        description: '1K (1024x1024), 2K (2048x2048), 4K (4096x4096), auto, or an explicit WIDTHxHEIGHT (multiples of 16).',
      },
      quality: {
        type: 'string',
        enum: QUALITIES,
        description: 'Render quality. Default: high.',
      },
      n: { type: 'integer', minimum: 1, maximum: 4, description: 'Number of images (1-4). Default: 1.' },
      images: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional local image file paths for image-to-image editing.',
      },
      outputPath: { type: 'string', description: 'Optional absolute output file path.' },
    },
    required: ['prompt'],
  },
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSize(value) {
  const raw = String(value ?? '1K').trim();
  const preset = SIZE_PRESETS[raw.toUpperCase()] || SIZE_PRESETS[raw];
  if (preset) return preset;
  if (/^\d{3,5}x\d{3,5}$/i.test(raw)) return raw.toLowerCase();
  throw new Error(`不支持的尺寸：${raw}（可选 1K / 2K / 4K / auto / 宽x高）`);
}

function normalizeModel(value) {
  const resolved = MODEL_ALIASES[String(value).toLowerCase()];
  if (!resolved) throw new Error(`不支持的模型：${value}（可选 ${MODELS.join(' / ')}）`);
  return resolved;
}

function normalizeQuality(value) {
  const quality = String(value ?? CONFIG.defaultQuality).toLowerCase();
  if (!QUALITIES.includes(quality)) throw new Error(`不支持的质量：${value}（可选 ${QUALITIES.join(' / ')}）`);
  return quality;
}

function detectExtension(buffer) {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.length > 6 && buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return 'png';
}

function extractErrorMessage(status, text) {
  let detail = '';
  try {
    const parsed = JSON.parse(text);
    const error = parsed.error ?? parsed;
    detail = [error.code, error.message || error.msg || error.type].filter(Boolean).join(': ');
  } catch {
    detail = text.slice(0, 300);
  }
  if (status === 403 && /1010|browser integrity/i.test(text)) {
    return '请求被 Cloudflare 拦截（1010 Browser Integrity Check），请在站点放行 /v1/* 或关闭浏览器完整性检查。';
  }
  if (status === 401) return '令牌无效或已过期（401）。';
  if (status === 402 || status === 403) return `余额或权限不足（${status}）：${detail}`;
  if (status === 429) return `请求过于频繁（429）：${detail}`;
  return `接口返回 ${status}：${detail || '无错误信息'}`;
}

async function requestJson(url, init) {
  let lastError;
  for (let attempt = 0; attempt <= CONFIG.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...(init.headers || {}) },
      });
      const text = await response.text();
      if (response.ok) {
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`接口返回了非 JSON 内容：${text.slice(0, 200)}`);
        }
      }
      const retryable = response.status === 429 || response.status >= 500 || (response.status === 403 && /1010/.test(text));
      lastError = new Error(extractErrorMessage(response.status, text));
      if (retryable && attempt < CONFIG.retries) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw lastError;
    } catch (error) {
      if (error.name === 'AbortError') {
        lastError = new Error(`请求超时（${CONFIG.timeoutMs}ms），可调大 REQUEST_TIMEOUT_MS。`);
        if (attempt < CONFIG.retries) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw lastError;
      }
      if (error === lastError) throw error;
      if (attempt < CONFIG.retries) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('请求失败');
}

function readImageFile(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new Error(`找不到图片文件：${absolute}`);
  return { absolute, buffer: fs.readFileSync(absolute) };
}

function mimeOf(buffer) {
  const extension = detectExtension(buffer);
  return extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
}

async function generateImage(args) {
  if (!CONFIG.token) {
    throw new Error('缺少 BIGYELLOW_TOKEN 环境变量，请填写你的生图令牌（sk-...）。');
  }
  const prompt = String(args.prompt ?? '').trim();
  if (!prompt) throw new Error('prompt 不能为空。');
  const model = normalizeModel(args.model ?? CONFIG.defaultModel);
  const size = normalizeSize(args.size);
  const quality = normalizeQuality(args.quality);
  const n = Math.min(4, Math.max(1, Number.parseInt(args.n ?? 1, 10) || 1));
  const images = Array.isArray(args.images) ? args.images.map(String) : [];

  let url;
  let init;
  if (images.length > 0) {
    url = `${CONFIG.base}/images/edits`;
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('n', String(n));
    form.append('size', size);
    form.append('quality', quality);
    for (const imagePath of images) {
      const { absolute, buffer } = readImageFile(imagePath);
      form.append('image', new Blob([buffer], { type: mimeOf(buffer) }), path.basename(absolute));
    }
    init = { method: 'POST', headers: { Authorization: `Bearer ${CONFIG.token}` }, body: form };
  } else {
    url = `${CONFIG.base}/images/generations`;
    init = {
      method: 'POST',
      headers: { Authorization: `Bearer ${CONFIG.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, n, size, quality }),
    };
  }

  const payload = await requestJson(url, init);
  const items = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  if (items.length === 0) throw new Error('接口没有返回图片数据。');

  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const files = [];
  for (const [index, item] of items.entries()) {
    let buffer;
    if (item.b64_json) {
      buffer = Buffer.from(item.b64_json, 'base64');
    } else if (item.url) {
      const imageResponse = await fetch(item.url, { headers: { 'User-Agent': USER_AGENT } });
      if (!imageResponse.ok) throw new Error(`下载图片失败：${imageResponse.status}`);
      buffer = Buffer.from(await imageResponse.arrayBuffer());
    } else {
      continue;
    }
    const target = args.outputPath
      ? path.resolve(String(args.outputPath))
      : path.join(CONFIG.outputDir, `${stamp}-${model.replace('gpt-image-2.5-', '')}-${index + 1}.${detectExtension(buffer)}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    files.push(target);
  }
  if (files.length === 0) throw new Error('接口返回的数据里没有可保存的图片。');

  const usage = payload.usage || {};
  const lines = [
    `已生成 ${files.length} 张图片`,
    `模型：${model}`,
    `尺寸：${size}`,
    `质量：${quality}`,
    '文件：',
    ...files.map((file) => `- ${file}`),
  ];
  if (usage.output_tokens) lines.push(`用量：输出 ${usage.output_tokens} tokens`);
  return { text: lines.join('\n'), files, model, size, quality };
}

async function callTool(name, args) {
  if (name !== 'generate_image') {
    return { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true };
  }
  try {
    const result = await generateImage(args || {});
    return { content: [{ type: 'text', text: result.text }], isError: false };
  } catch (error) {
    return { content: [{ type: 'text', text: `生成失败：${error.message}` }], isError: true };
  }
}

async function handleMessage(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return;
  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'bigyellow-imagegen', version: VERSION },
        },
      });
      return;
    }
    if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
      return;
    }
    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
      return;
    }
    if (method === 'tools/call') {
      const result = await callTool(params?.name, params?.arguments);
      send({ jsonrpc: '2.0', id, result });
      return;
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
  } catch (error) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: error.message } });
  }
}

if (!CONFIG.token) {
  logErr('BIGYELLOW_TOKEN 未设置：工具调用会返回配置错误。');
}
logErr(`bigyellow-imagegen v${VERSION} ready (model=${CONFIG.defaultModel}, dir=${CONFIG.outputDir})`);

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    logErr('忽略无法解析的行');
    return;
  }
  void handleMessage(message);
});
