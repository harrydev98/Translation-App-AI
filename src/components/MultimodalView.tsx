import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookPlus,
  Check,
  Code2,
  Copy,
  Download,
  FileUp,
  ImagePlus,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import {
  SOURCE_LANGUAGES,
  TARGET_LANGUAGES,
  TRANSLATION_GENRES,
} from '../constants/languages';
import { translateStream } from '../services/translateClient';
import type { GlossaryTerm, Novel, UserSettings } from '../types';
import { triggerFileDownload } from '../utils/chapterParser';
import { findMatchingGlossaryTerms } from '../utils/glossaryHighlight';

interface MultimodalViewProps {
  activeNovel: Novel | null;
  glossary: GlossaryTerm[];
  settings: UserSettings;
  sessionApiKey: string;
  onSaveAsChapter?: (input: { titleSource: string; paragraphs: string[] }) => Promise<void>;
}

type ToolMode = 'image' | 'format';

interface ImageQueueItem {
  id: string;
  name: string;
  dataUrl: string;
  translatedText: string;
  status: 'pending' | 'translating' | 'done' | 'error';
  error?: string;
}

const IMAGE_PRESETS = [
  {
    id: 'novel_page',
    label: 'Trang sách / Tiểu thuyết quét',
    instruction:
      'Dịch toàn bộ đoạn văn trong trang sách sang văn phong tiểu thuyết mượt mà, giữ đúng thứ tự các đoạn từ trên xuống dưới.',
  },
  {
    id: 'comic',
    label: 'Truyện tranh / Khung thoại',
    instruction:
      'Dịch lời thoại trong các khung thoại theo thứ tự đọc tự nhiên, ngắn gọn và đúng ngữ khí nhân vật.',
  },
  {
    id: 'ui_doc',
    label: 'Ảnh chụp màn hình / Bảng biểu',
    instruction:
      'Giữ nguyên bố cục nhãn và danh sách trong ảnh, dịch chính xác thuật ngữ và số liệu.',
  },
];

const FORMAT_SAMPLES: Record<string, string> = {
  JSON: `{
  "chapter_title": "第一章 山门初雪",
  "speaker": "林尘",
  "dialogue": "有劳师兄通报，我这便随你前往传功殿。",
  "status": "draft"
}`,
  Markdown: `# 第二章 剑意初成

- **人物**: 林尘（外门弟子）
- **境界**: \`筑基期\`

> 暮色四合，青云宗山门外的石阶已落了一层薄雪。`,
  字幕: `1
00:00:12,400 --> 00:00:15,800
林师弟，长老在传功殿等你。

2
00:00:16,200 --> 00:00:19,500
有劳师兄通报，我这便随你前往。`,
  'VTT/ASS': `WEBVTT

00:00:12.400 --> 00:00:15.800
<i>林师弟</i>，长老在传功殿等你。

00:00:16.200 --> 00:00:19.500
有劳师兄通报，我这便随你前往。`,
  'CSV/TSV': `term_id,source,note
T001,"青云宗","Tên tông môn chính"
T002,"青霜剑","Bản mệnh phi kiếm của Lâm Trần"`,
  HTML: `<article class="chapter">
  <h1>第一章 山门初雪</h1>
  <p class="lead">暮色四合，<strong>青云宗</strong>山门外的石阶已落了一层薄雪。</p>
</article>`,
};

async function resizeImageToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không đọc được tệp ảnh.'));
    reader.readAsDataURL(file);
  });

  if (file.size <= 1_800_000) {
    return rawDataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 2048;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

export function MultimodalView({
  activeNovel,
  glossary,
  settings,
  sessionApiKey,
  onSaveAsChapter,
}: MultimodalViewProps) {
  const [mode, setMode] = useState<ToolMode>('image');
  const [sourceLang, setSourceLang] = useState(activeNovel?.sourceLang || 'zh');
  const [targetLang, setTargetLang] = useState(activeNovel?.targetLang || 'vi');
  const [useNovelGlossary, setUseNovelGlossary] = useState(true);

  // Batch multi-image state
  const [imageQueue, setImageQueue] = useState<ImageQueueItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [imagePresetId, setImagePresetId] = useState('novel_page');
  const [customImageInstruction, setCustomImageInstruction] = useState(
    IMAGE_PRESETS[0].instruction
  );
  const [savingChapter, setSavingChapter] = useState(false);
  const [savedChapterNotice, setSavedChapterNotice] = useState<string | null>(null);

  // Format mode state
  const [genreId, setGenreId] = useState('JSON');
  const [formatSourceText, setFormatSourceText] = useState(FORMAT_SAMPLES.JSON);
  const [formatInstruction, setFormatInstruction] = useState(
    TRANSLATION_GENRES.find((g) => g.id === 'JSON')?.defaultInstruction || ''
  );

  // Output / streaming state
  const [outputText, setOutputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeBatchProgress, setActiveBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);

  const selectedImage = imageQueue.find((img) => img.id === selectedImageId) || imageQueue[0] || null;

  const handleImageFiles = useCallback(async (files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) {
      setError('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
      return;
    }
    setError(null);
    setSavedChapterNotice(null);

    const added: ImageQueueItem[] = [];
    for (const file of valid.slice(0, 30)) {
      const dataUrl = await resizeImageToDataUrl(file);
      added.push({
        id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name || 'anh_dan_tu_clipboard.png',
        dataUrl,
        translatedText: '',
        status: 'pending',
      });
    }

    setImageQueue((prev) => {
      const next = [...prev, ...added];
      if (!selectedImageId && added[0]) {
        setSelectedImageId(added[0].id);
      }
      return next;
    });
  }, [selectedImageId]);

  // Support Ctrl+V / Cmd+V paste image directly
  useEffect(() => {
    if (mode !== 'image') return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        handleImageFiles(pastedFiles);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [mode, handleImageFiles]);

  const moveImageItem = (id: string, dir: -1 | 1) => {
    setImageQueue((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const removeImageItem = (id: string) => {
    setImageQueue((prev) => {
      const next = prev.filter((i) => i.id !== id);
      if (selectedImageId === id) {
        setSelectedImageId(next[0]?.id || null);
      }
      return next;
    });
  };

  const handleSelectImagePreset = (presetId: string) => {
    setImagePresetId(presetId);
    const found = IMAGE_PRESETS.find((p) => p.id === presetId);
    if (found) setCustomImageInstruction(found.instruction);
  };

  const handleSelectGenre = (nextGenreId: string) => {
    setGenreId(nextGenreId);
    const found = TRANSLATION_GENRES.find((g) => g.id === nextGenreId);
    if (found) setFormatInstruction(found.defaultInstruction);
    if (FORMAT_SAMPLES[nextGenreId]) {
      setFormatSourceText(FORMAT_SAMPLES[nextGenreId]);
    }
  };

  const handleFormatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFormatSourceText(text);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.json')) handleSelectGenre('JSON');
    else if (lower.endsWith('.md') || lower.endsWith('.markdown')) handleSelectGenre('Markdown');
    else if (lower.endsWith('.srt')) handleSelectGenre('字幕');
    else if (lower.endsWith('.vtt') || lower.endsWith('.ass')) handleSelectGenre('VTT/ASS');
    else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) handleSelectGenre('CSV/TSV');
    else if (lower.endsWith('.html') || lower.endsWith('.htm')) handleSelectGenre('HTML');
  };

  const combineQueueOutput = (items: ImageQueueItem[]) => {
    if (items.length <= 1) return items[0]?.translatedText || '';
    return items
      .filter((i) => i.translatedText.trim().length > 0)
      .map((i, idx) => `--- [Trang ${idx + 1}: ${i.name}] ---\n${i.translatedText.trim()}`)
      .join('\n\n');
  };

  const handleRunTranslation = async () => {
    if (isStreaming) return;
    if (mode === 'image' && imageQueue.length === 0) {
      setError('Hãy chọn, kéo thả hoặc dán (Ctrl+V) ít nhất một hình ảnh trước khi dịch.');
      return;
    }
    if (mode === 'format' && !formatSourceText.trim()) {
      setError('Vui lòng nhập nội dung cần dịch.');
      return;
    }

    const controller = new AbortController();
    setAbortCtrl(controller);
    setIsStreaming(true);
    setError(null);
    setSavedChapterNotice(null);

    try {
      if (mode === 'format') {
        setOutputText('');
        const activeGlossary =
          useNovelGlossary && activeNovel
            ? findMatchingGlossaryTerms(formatSourceText, glossary)
            : [];

        const result = await translateStream(
          {
            text: formatSourceText,
            sourceLang,
            targetLang,
            glossary: activeGlossary.map((g) => ({
              sourceTerm: g.sourceTerm,
              targetTerm: g.targetTerm,
            })),
            instruction: formatInstruction,
            genre: genreId,
            model: settings.apiModel,
            baseUrl: settings.apiBaseUrl,
            apiKey: sessionApiKey,
          },
          {
            signal: controller.signal,
            onDelta: (acc) => setOutputText(acc),
          }
        );
        setOutputText(result);
        return;
      }

      // Multi-page image queue sequential Zero-OCR translation
      const activeGlossary =
        useNovelGlossary && activeNovel
          ? glossary.filter((g) => g.enabled).slice(0, 40)
          : [];

      let workingQueue = [...imageQueue];
      setActiveBatchProgress({ current: 0, total: workingQueue.length });

      for (let i = 0; i < workingQueue.length; i++) {
        if (controller.signal.aborted) break;
        const page = workingQueue[i];
        setSelectedImageId(page.id);
        setActiveBatchProgress({ current: i + 1, total: workingQueue.length });
        workingQueue = workingQueue.map((item) =>
          item.id === page.id ? { ...item, status: 'translating', error: undefined } : item
        );
        setImageQueue(workingQueue);

        const priorCombined = workingQueue
          .slice(0, i)
          .filter((p) => p.translatedText.trim())
          .map((p, idx) =>
            workingQueue.length > 1
              ? `--- [Trang ${idx + 1}: ${p.name}] ---\n${p.translatedText.trim()}`
              : p.translatedText.trim()
          )
          .join('\n\n');

        const result = await translateStream(
          {
            imageDataUrl: page.dataUrl,
            sourceLang,
            targetLang,
            glossary: activeGlossary.map((g) => ({
              sourceTerm: g.sourceTerm,
              targetTerm: g.targetTerm,
            })),
            instruction: customImageInstruction,
            genre: '文本',
            model: settings.apiModel,
            baseUrl: settings.apiBaseUrl,
            apiKey: sessionApiKey,
          },
          {
            signal: controller.signal,
            onDelta: (acc) => {
              const liveText =
                workingQueue.length > 1
                  ? `${priorCombined ? `${priorCombined}\n\n` : ''}--- [Trang ${i + 1}: ${page.name}] ---\n${acc}`
                  : acc;
              setOutputText(liveText);
            },
          }
        );

        workingQueue = workingQueue.map((item) =>
          item.id === page.id
            ? { ...item, status: 'done', translatedText: result }
            : item
        );
        setImageQueue(workingQueue);
        setOutputText(combineQueueOutput(workingQueue));
      }
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (!aborted) {
        setError(err instanceof Error ? err.message : 'Không thể hoàn tất yêu cầu dịch.');
      }
    } finally {
      setIsStreaming(false);
      setActiveBatchProgress(null);
      setAbortCtrl(null);
    }
  };

  const handleStop = () => {
    abortCtrl?.abort();
  };

  const handleCopy = async () => {
    if (!outputText.trim()) return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    if (!outputText.trim()) return;
    const extMap: Record<string, string> = {
      JSON: 'json',
      Markdown: 'md',
      字幕: 'srt',
      'VTT/ASS': 'vtt',
      'CSV/TSV': 'csv',
      HTML: 'html',
    };
    const ext = mode === 'format' ? extMap[genreId] || 'txt' : 'txt';
    triggerFileDownload(`index_translate_output.${ext}`, outputText);
  };

  const handleSaveResultAsChapter = async () => {
    if (!activeNovel || !onSaveAsChapter || !outputText.trim() || savingChapter) return;
    setSavingChapter(true);
    setSavedChapterNotice(null);
    try {
      const paragraphs = outputText
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && !p.startsWith('--- [Trang'));

      const finalParagraphs = paragraphs.length > 0 ? paragraphs : [outputText.trim()];
      const titleSource =
        mode === 'image'
          ? `Chương từ ${imageQueue.length} ảnh (${imageQueue[0]?.name || 'Zero-OCR'})`
          : `Chương từ định dạng ${genreId}`;

      await onSaveAsChapter({ titleSource, paragraphs: finalParagraphs });
      setSavedChapterNotice(`Đã lưu thành chương mới trong “${activeNovel.title}”.`);
    } finally {
      setSavingChapter(false);
    }
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#E4DDD0] dark:border-[#2E2924]">
        <div>
          <p className="text-xs font-medium text-[#B45309] dark:text-[#D97706] mb-1">
            Năng lực đa phương thức · {settings.apiModel}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1F1C18] dark:text-[#EDE8DF]">
            Dịch Ảnh Hàng Loạt Zero-OCR & Định Dạng Kỹ Thuật
          </h1>
          <p className="mt-2 text-sm text-[#6B6257] dark:text-[#A89F91] max-w-2xl">
            Dịch hàng loạt trang sách quét / manga không qua bước OCR trung gian và lưu thẳng thành
            chương truyện, hoặc dịch giữ cấu trúc JSON, Markdown, SRT/VTT/ASS, CSV/TSV, HTML.
          </p>
        </div>

        {/* Mode Segmented Toggle */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#1C1917] border border-[#E4DDD0] dark:border-[#2E2924] shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={() => {
              setMode('image');
              setError(null);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'image'
                ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                : 'text-[#6B6257] dark:text-[#A89F91]'
            }`}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Dịch ảnh hàng loạt ({imageQueue.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('format');
              setError(null);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'format'
                ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                : 'text-[#6B6257] dark:text-[#A89F91]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Dịch giữ Định dạng
          </button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="mt-6 p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/55 dark:bg-[#1C1917]/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#6B6257] dark:text-[#A89F91]">Nguồn:</span>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF]"
            >
              {SOURCE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#6B6257] dark:text-[#A89F91]">Đích:</span>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF]"
            >
              {TARGET_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {activeNovel && (
            <label className="flex items-center gap-2 cursor-pointer text-[#1F1C18] dark:text-[#EDE8DF]">
              <input
                type="checkbox"
                checked={useNovelGlossary}
                onChange={(e) => setUseNovelGlossary(e.target.checked)}
                className="accent-[#B45309]"
              />
              <span>
                Áp dụng từ điển “{activeNovel.title}” ({glossary.filter((g) => g.enabled).length} từ)
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white cursor-pointer whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5" />
              {activeBatchProgress
                ? `Dừng (${activeBatchProgress.current}/${activeBatchProgress.total})`
                : 'Dừng dịch'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRunTranslation}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              {mode === 'image'
                ? imageQueue.length > 1
                  ? `Dịch ${imageQueue.length} trang ảnh`
                  : 'Dịch nội dung ảnh'
                : 'Dịch giữ nguyên cấu trúc'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3.5 rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 text-xs text-[#DC2626] dark:text-[#F87171]">
          {error}
        </div>
      )}

      {savedChapterNotice && (
        <div className="mt-4 p-3.5 rounded-lg border border-[#15803D]/40 bg-[#15803D]/10 text-xs text-[#15803D] dark:text-[#4ADE80]">
          {savedChapterNotice}
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Input Pane */}
        <div className="lg:col-span-6 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/35 dark:bg-[#1C1917]/50 p-5 flex flex-col space-y-4">
          {mode === 'image' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  Hàng đợi trang ảnh ({imageQueue.length} trang · kéo thả hoặc Ctrl+V)
                </span>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1 text-xs font-medium text-[#B45309] dark:text-[#D97706] hover:underline cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5" />
                    Thêm ảnh
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) handleImageFiles(e.target.files);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                  {imageQueue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageQueue([]);
                        setSelectedImageId(null);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-[#DC2626] hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Xóa hết
                    </button>
                  )}
                </div>
              </div>

              {imageQueue.length === 0 ? (
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.length) handleImageFiles(e.dataTransfer.files);
                  }}
                  className="flex-1 min-h-[280px] rounded-lg border border-dashed border-[#C7BCAE] dark:border-[#443D36] bg-[#FAF7F2] dark:bg-[#141210] flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:border-[#B45309] transition-colors"
                >
                  <ImagePlus className="w-8 h-8 text-[#B45309] dark:text-[#D97706] mb-3" />
                  <p className="text-sm font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                    Chọn 1 hoặc nhiều trang truyện tranh / trang sách quét
                  </p>
                  <p className="text-xs text-[#6B6257] dark:text-[#A89F91] mt-1">
                    Hỗ trợ chọn nhiều tệp PNG, JPG, WEBP cùng lúc hoặc dán Ctrl+V
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) handleImageFiles(e.target.files);
                    }}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="flex-1 flex flex-col space-y-3">
                  {selectedImage && (
                    <div className="rounded-lg overflow-hidden border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] max-h-[300px] flex items-center justify-center">
                      <img
                        src={selectedImage.dataUrl}
                        alt={selectedImage.name}
                        className="max-h-[300px] w-auto object-contain"
                      />
                    </div>
                  )}

                  {/* Queue list */}
                  <div className="rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white/80 dark:bg-[#141210] divide-y divide-[#E4DDD0]/70 dark:divide-[#2E2924]/70 max-h-44 overflow-y-auto">
                    {imageQueue.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                          selectedImage?.id === item.id ? 'bg-[#F3EFE6] dark:bg-[#1C1917]' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedImageId(item.id)}
                          className="flex-1 min-w-0 text-left flex items-center gap-2 cursor-pointer"
                        >
                          <span className="font-mono-tabular text-[#6B6257] dark:text-[#A89F91]">
                            #{idx + 1}
                          </span>
                          <span className="truncate font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                            {item.name}
                          </span>
                          <span className="font-mono-tabular text-[11px] text-[#B45309] dark:text-[#D97706]">
                            {item.status === 'done'
                              ? 'Xong'
                              : item.status === 'translating'
                                ? 'Đang dịch...'
                                : ''}
                          </span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0 || isStreaming}
                            onClick={() => moveImageItem(item.id, -1)}
                            className="p-1 text-[#6B6257] hover:text-[#1F1C18] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === imageQueue.length - 1 || isStreaming}
                            onClick={() => moveImageItem(item.id, 1)}
                            className="p-1 text-[#6B6257] hover:text-[#1F1C18] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isStreaming}
                            onClick={() => removeImageItem(item.id)}
                            className="p-1 text-[#6B6257] hover:text-[#DC2626] disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#E4DDD0] dark:border-[#2E2924] space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {IMAGE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectImagePreset(preset.id)}
                      className={`px-3 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                        imagePresetId === preset.id
                          ? 'border-[#B45309] dark:border-[#D97706] text-[#B45309] dark:text-[#D97706] bg-white dark:bg-[#141210]'
                          : 'border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={customImageInstruction}
                  onChange={(e) => setCustomImageInstruction(e.target.value)}
                  placeholder="Chỉ dẫn thêm cho mô hình khi đọc ảnh..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  Định dạng & Ràng buộc (--genre / --instruction)
                </span>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#B45309] dark:text-[#D97706] cursor-pointer">
                    <FileUp className="w-3.5 h-3.5" />
                    Nạp tệp
                    <input
                      type="file"
                      accept=".json,.md,.markdown,.srt,.vtt,.ass,.csv,.tsv,.html,.htm,.txt"
                      onChange={handleFormatFileUpload}
                      className="hidden"
                    />
                  </label>
                  <select
                    value={genreId}
                    onChange={(e) => handleSelectGenre(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-md border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF]"
                  >
                    {TRANSLATION_GENRES.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                rows={13}
                value={formatSourceText}
                onChange={(e) => setFormatSourceText(e.target.value)}
                placeholder="Dán nội dung JSON, Markdown, SRT/VTT/ASS, CSV/TSV hoặc HTML..."
                className="flex-1 w-full px-3.5 py-3 text-sm font-mono-tabular leading-relaxed rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309] resize-y"
              />

              <div className="space-y-1.5">
                <label className="block text-xs text-[#6B6257] dark:text-[#A89F91]">
                  Ràng buộc chỉ dẫn (--instruction)
                </label>
                <input
                  type="text"
                  value={formatInstruction}
                  onChange={(e) => setFormatInstruction(e.target.value)}
                  placeholder="VD: Giữ nguyên toàn bộ key JSON hoặc timeline VTT/ASS..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                />
              </div>
            </>
          )}
        </div>

        {/* Right Output Pane */}
        <div className="lg:col-span-6 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-white/85 dark:bg-[#181512] p-5 flex flex-col space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E4DDD0] dark:border-[#2E2924]">
            <span className="text-xs font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
              {isStreaming
                ? activeBatchProgress
                  ? `Đang dịch trang ${activeBatchProgress.current}/${activeBatchProgress.total}...`
                  : 'Đang nhận luồng dịch trực tiếp...'
                : 'Kết quả chuyển ngữ'}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {activeNovel && onSaveAsChapter && (
                <button
                  type="button"
                  disabled={!outputText.trim() || savingChapter || isStreaming}
                  onClick={handleSaveResultAsChapter}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[#B45309] dark:border-[#D97706] text-[#B45309] dark:text-[#D97706] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  <BookPlus className="w-3.5 h-3.5" />
                  {savingChapter ? 'Đang lưu...' : 'Lưu thành chương mới'}
                </button>
              )}

              <button
                type="button"
                disabled={!outputText.trim()}
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-40"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Đã chép' : 'Sao chép'}
              </button>
              <button
                type="button"
                disabled={!outputText.trim()}
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Tải xuống
              </button>
            </div>
          </div>

          <textarea
            rows={16}
            value={outputText}
            onChange={(e) => setOutputText(e.target.value)}
            placeholder="Bản dịch từ Index-Translate sẽ hiển thị trực tiếp tại đây..."
            className={`flex-1 w-full px-3.5 py-3 leading-relaxed rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2]/60 dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309] resize-y ${
              mode === 'format' && genreId !== '小说' && genreId !== '文本'
                ? 'text-sm font-mono-tabular'
                : 'text-base font-literary'
            }`}
          />
        </div>
      </div>
    </main>
  );
}

