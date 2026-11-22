import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_BASE_URL = 'https://index-translate.bilibili.com/v1';
const DEFAULT_MODEL = 'Index-Translate-9B';

const LANG_ZH_MAP: Record<string, string> = {
  auto: '原文',
  zh: '中文',
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文',
  vi: '越南语',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
  th: '泰语',
  id: '印尼语',
};

interface GlossaryInput {
  sourceTerm: string;
  targetTerm: string;
}

function normalizeBaseUrl(rawUrl?: string): string {
  const trimmed = (rawUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return DEFAULT_BASE_URL;
    }
    return trimmed;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function buildIndexTranslatePrompt(params: {
  text: string;
  sourceLang: string;
  targetLang: string;
  glossary?: GlossaryInput[];
  instruction?: string;
  genre?: string;
  previousContext?: string;
}): string {
  const srcName = LANG_ZH_MAP[params.sourceLang] || params.sourceLang || '原文';
  const tgtName = LANG_ZH_MAP[params.targetLang] || params.targetLang || '越南语';
  const genre = params.genre || '小说';

  const validGlossary = (params.glossary || [])
    .filter((g) => g.sourceTerm?.trim() && g.targetTerm?.trim())
    .slice(0, 60);

  const hasInstruction = Boolean(params.instruction && params.instruction.trim().length > 0);
  const hasGlossary = validGlossary.length > 0;
  const hasContext = Boolean(params.previousContext && params.previousContext.trim().length > 0);

  if (!hasGlossary && !hasInstruction && !hasContext) {
    const sourcePrefix = params.sourceLang === 'auto' ? '' : srcName;
    return `请将以下${sourcePrefix}${genre}翻译成${tgtName}，只输出译文，不要有任何额外说明：\n\n${params.text}`;
  }

  const constraints: string[] = [];
  if (hasGlossary) {
    const glossaryPairs = validGlossary
      .map((g) => `${g.sourceTerm.trim()}→${g.targetTerm.trim()}`)
      .join('、');
    constraints.push(`${constraints.length + 1}. 【硬性要求】专名/术语对照: ${glossaryPairs}`);
  }
  if (hasContext) {
    constraints.push(
      `${constraints.length + 1}. 【上文语境参考（仅用于保持人称与语气连贯，切勿重复输出或翻译上文）】${params.previousContext!.trim().slice(-400)}`
    );
  }
  if (hasInstruction) {
    constraints.push(`${constraints.length + 1}. 【注意】${params.instruction!.trim()}`);
  }

  const sourcePrefix = params.sourceLang === 'auto' ? '' : srcName;
  return [
    `请将以下${sourcePrefix}${genre}翻译成${tgtName}，并且严格遵循所有约束要求。`,
    '【源文】',
    params.text,
    '【约束要求】',
    ...constraints,
    '只输出译文，不要有任何额外说明。',
  ].join('\n');
}

function buildImageTranslatePrompt(params: {
  sourceLang: string;
  targetLang: string;
  glossary?: GlossaryInput[];
  instruction?: string;
}): string {
  const tgtName = LANG_ZH_MAP[params.targetLang] || params.targetLang || '越南语';
  const srcName =
    params.sourceLang === 'auto' ? '' : LANG_ZH_MAP[params.sourceLang] || params.sourceLang || '';
  const validGlossary = (params.glossary || [])
    .filter((g) => g.sourceTerm?.trim() && g.targetTerm?.trim())
    .slice(0, 60);

  const lines = [
    `请识别并翻译图片中的所有${srcName}文本内容为${tgtName}，保持原有段落或对话顺序，只输出译文结果，不要有任何额外说明。`,
  ];

  if (validGlossary.length > 0) {
    lines.push(
      `【硬性术语对照】${validGlossary.map((g) => `${g.sourceTerm.trim()}→${g.targetTerm.trim()}`).join('、')}`
    );
  }
  if (params.instruction && params.instruction.trim()) {
    lines.push(`【补充要求】${params.instruction.trim()}`);
  }

  return lines.join('\n');
}

function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'mac-van-translate-proxy' });
  });

  app.post('/api/test-connection', async (req, res) => {
    const baseUrl = normalizeBaseUrl(req.body?.baseUrl);
    const model = String(req.body?.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const prompt = buildIndexTranslatePrompt({
        text: '青云山巅，云雾缭绕，少年握紧了手中的古剑。',
        sourceLang: 'zh',
        targetLang: 'vi',
        genre: '小说',
      });

      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.0,
          stream: false,
          chat_template_kwargs: { enable_thinking: false },
        }),
      });

      const latencyMs = Date.now() - startedAt;

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        res.status(upstream.status).json({
          ok: false,
          error: `API phản hồi mã ${upstream.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`,
          latencyMs,
        });
        return;
      }

      const data = await upstream.json();
      const rawContent = data?.choices?.[0]?.message?.content || '';
      const sample = stripThinkingTags(rawContent);

      res.json({
        ok: true,
        model,
        baseUrl,
        latencyMs,
        sample,
      });
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Hết thời gian chờ kết nối tới máy chủ dịch (20s).'
          : error instanceof Error
            ? error.message
            : 'Không thể kết nối tới API dịch.';
      res.status(502).json({ ok: false, error: message, latencyMs });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.post('/api/translate', async (req, res) => {
    const {
      text = '',
      imageDataUrl = '',
      sourceLang = 'zh',
      targetLang = 'vi',
      glossary = [],
      instruction = '',
      genre = '小说',
      previousContext = '',
      model = DEFAULT_MODEL,
      baseUrl: rawBaseUrl,
      apiKey = '',
      stream = true,
    } = req.body || {};

    const hasImage = typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/');
    const hasText = typeof text === 'string' && text.trim().length > 0;

    if (!hasImage && !hasText) {
      res.status(400).json({ error: 'Văn bản hoặc hình ảnh cần dịch không được để trống.' });
      return;
    }

    const baseUrl = normalizeBaseUrl(rawBaseUrl);
    const selectedModel = String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const safeGlossary = Array.isArray(glossary) ? glossary : [];
    const safeInstruction = typeof instruction === 'string' ? instruction : '';

    const messageContent = hasImage
      ? [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          {
            type: 'text',
            text: buildImageTranslatePrompt({
              sourceLang,
              targetLang,
              glossary: safeGlossary,
              instruction: safeInstruction,
            }),
          },
        ]
      : buildIndexTranslatePrompt({
          text: String(text).trim(),
          sourceLang,
          targetLang,
          glossary: safeGlossary,
          instruction: safeInstruction,
          genre: typeof genre === 'string' ? genre : '小说',
          previousContext: typeof previousContext === 'string' ? previousContext : '',
        });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let clientClosed = false;

    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
        controller.abort();
      }
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (typeof apiKey === 'string' && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const payload = {
      model: selectedModel,
      messages: [{ role: 'user', content: messageContent }],
      temperature: 0.0,
      stream: Boolean(stream),
      chat_template_kwargs: { enable_thinking: false },
    };

    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        const msg = `Lỗi từ máy chủ dịch (${upstream.status}): ${errText.slice(0, 240) || upstream.statusText}`;
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
          res.end();
        } else {
          res.status(upstream.status).json({ error: msg });
        }
        return;
      }

      if (!stream) {
        const data = await upstream.json();
        const content = stripThinkingTags(data?.choices?.[0]?.message?.content || '');
        res.json({ text: content, model: selectedModel });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      if (!upstream.body) {
        res.write(`data: ${JSON.stringify({ error: 'Máy chủ không trả về luồng dữ liệu.' })}\n\n`);
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';
      let insideThink = false;

      let streamDone = false;
      while (!clientClosed && !streamDone) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data:')) continue;
          const payloadStr = line.slice(5).trim();
          if (payloadStr === '[DONE]') {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(payloadStr);
            const delta: string = parsed?.choices?.[0]?.delta?.content || '';
            if (!delta) continue;

            // Filter <think> blocks cleanly if any model emits them
            let cleanDelta = delta;
            if (cleanDelta.includes('<think>')) {
              insideThink = true;
              cleanDelta = cleanDelta.split('<think>')[0];
            }
            if (insideThink) {
              if (cleanDelta.includes('</think>')) {
                insideThink = false;
                cleanDelta = cleanDelta.split('</think>').slice(1).join('');
              } else if (delta.includes('</think>')) {
                insideThink = false;
                cleanDelta = delta.split('</think>').slice(1).join('');
              } else {
                cleanDelta = '';
              }
            }

            if (cleanDelta) {
              fullText += cleanDelta;
              res.write(`data: ${JSON.stringify({ delta: cleanDelta })}\n\n`);
            }
          } catch {
            // Ignore partial JSON frames
          }
        }
      }

      if (streamDone) {
        await reader.cancel().catch(() => {});
      }

      if (!clientClosed) {
        res.write(`data: ${JSON.stringify({ done: true, text: stripThinkingTags(fullText) })}\n\n`);
        res.end();
      }
    } catch (error) {
      if (clientClosed) return;
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Yêu cầu dịch đã bị hủy hoặc quá thời gian chờ.'
          : error instanceof Error
            ? error.message
            : 'Lỗi kết nối máy chủ dịch.';
      if (stream && res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      } else {
        res.status(502).json({ error: message });
      }
    } finally {
      clearTimeout(timeout);
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
