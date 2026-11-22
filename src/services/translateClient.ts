export interface TranslateRequestParams {
  text?: string;
  imageDataUrl?: string;
  sourceLang: string;
  targetLang: string;
  glossary?: Array<{ sourceTerm: string; targetTerm: string }>;
  instruction?: string;
  genre?: string;
  previousContext?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  model?: string;
  baseUrl?: string;
  latencyMs?: number;
  sample?: string;
  error?: string;
}

export async function testTranslationApiConnection(params: {
  baseUrl: string;
  model: string;
  apiKey?: string;
}): Promise<ConnectionTestResult> {
  const response = await fetch('/api/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => ({
    ok: false,
    error: `HTTP ${response.status}`,
  }));
  return data;
}

export async function translateStream(
  params: TranslateRequestParams,
  callbacks: {
    onDelta: (accumulated: string) => void;
    signal?: AbortSignal;
  }
): Promise<string> {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: callbacks.signal,
    body: JSON.stringify({
      ...params,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errPayload = await response.json().catch(() => null);
    throw new Error(errPayload?.error || `Lỗi máy chủ dịch (HTTP ${response.status})`);
  }

  if (!response.body) {
    throw new Error('Không nhận được luồng phản hồi từ API dịch.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const evt of events) {
      const lines = evt.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        let parsed: { delta?: string; done?: boolean; text?: string; error?: string };
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.delta) {
          accumulated += parsed.delta;
          callbacks.onDelta(accumulated);
        }
        if (parsed.done && typeof parsed.text === 'string') {
          accumulated = parsed.text;
          callbacks.onDelta(accumulated);
        }
      }
    }
  }

  return accumulated.trim();
}

export async function translateOnce(
  params: TranslateRequestParams,
  signal?: AbortSignal
): Promise<{ text: string; model: string }> {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      ...params,
      stream: false,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Lỗi máy chủ dịch (HTTP ${response.status})`);
  }

  return {
    text: String(data?.text || '').trim(),
    model: String(data?.model || params.model || 'Index-Translate-9B'),
  };
}

