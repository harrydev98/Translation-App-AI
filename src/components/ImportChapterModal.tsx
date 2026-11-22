import { useMemo, useRef, useState } from 'react';
import { BookCopy, FileText, FileUp, X } from 'lucide-react';
import { FIELD_LIMITS } from '../types';
import {
  parseChapterText,
  parseMultiChapterBook,
  type ParsedMultiChapterItem,
} from '../utils/chapterParser';

interface ImportChapterModalProps {
  nextOrder: number;
  onClose: () => void;
  onImport: (input: { titleSource: string; paragraphs: string[]; order: number }) => Promise<void>;
  onImportMultiple?: (items: ParsedMultiChapterItem[]) => Promise<void>;
}

export function ImportChapterModal({
  nextOrder,
  onClose,
  onImport,
  onImportMultiple,
}: ImportChapterModalProps) {
  const [importMode, setImportMode] = useState<'single' | 'multi'>('single');
  const [rawText, setRawText] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [order, setOrder] = useState(nextOrder);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedSingle = useMemo(() => {
    return parseChapterText(rawText, `Chương ${order}`);
  }, [rawText, order]);

  const parsedMulti = useMemo(() => {
    if (importMode !== 'multi') return [];
    return parseMultiChapterBook(rawText, order);
  }, [importMode, rawText, order]);

  const effectiveTitle = (customTitle.trim() || parsedSingle.title).slice(
    0,
    FIELD_LIMITS.CHAPTER_TITLE_MAX
  );

  const totalMultiParagraphs = useMemo(
    () => parsedMulti.reduce((sum, ch) => sum + ch.paragraphs.length, 0),
    [parsedMulti]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const content = await file.text();
    setRawText(content);

    // Auto-switch to multi-chapter mode if the uploaded file has >= 2 chapter headings
    const multiGuess = parseMultiChapterBook(content, order);
    if (multiGuess.length >= 2 && onImportMultiple) {
      setImportMode('multi');
    } else {
      const baseName = file.name.replace(/\.(txt|md|markdown)$/i, '').trim();
      if (!customTitle && baseName) {
        const auto = parseChapterText(content, baseName);
        setCustomTitle(auto.title);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (importMode === 'multi' && onImportMultiple) {
      if (parsedMulti.length === 0) return;
      setSubmitting(true);
      try {
        await onImportMultiple(parsedMulti);
        onClose();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (parsedSingle.paragraphs.length === 0) return;
    setSubmitting(true);
    try {
      await onImport({
        titleSource: effectiveTitle,
        paragraphs: parsedSingle.paragraphs,
        order,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#1C1917] p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-[#E4DDD0] dark:border-[#2E2924] shrink-0">
          <h2 className="font-display text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
            Nhập nội dung tiểu thuyết (TXT / Markdown)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode toggle */}
        {onImportMultiple && (
          <div className="mt-4 flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#141210] border border-[#E4DDD0] dark:border-[#2E2924] self-start shrink-0">
            <button
              type="button"
              onClick={() => setImportMode('single')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                importMode === 'single'
                  ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                  : 'text-[#6B6257] dark:text-[#A89F91]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Nhập 1 chương lẻ
            </button>
            <button
              type="button"
              onClick={() => setImportMode('multi')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                importMode === 'multi'
                  ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                  : 'text-[#6B6257] dark:text-[#A89F91]'
              }`}
            >
              <BookCopy className="w-3.5 h-3.5" />
              Tách bộ nhiều chương
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-dashed border-[#C7BCAE] dark:border-[#443D36] bg-[#F3EFE6]/60 dark:bg-[#141210]/60">
            <div className="text-sm">
              <p className="font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                {fileName ? `Đã nạp tệp: ${fileName}` : 'Chọn tệp .txt hoặc .md từ máy tính'}
              </p>
              <p className="text-xs text-[#6B6257] dark:text-[#A89F91] mt-0.5">
                {importMode === 'multi'
                  ? 'Tự động nhận diện các tiêu đề như 第X章, Chapter X, Chương X, # Tiêu đề để tách hàng loạt.'
                  : 'Hệ thống tự động tách tiêu đề chương và chia đoạn văn thông minh để dịch từng đoạn.'}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#FAF7F2] dark:hover:bg-[#26221E] transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileUp className="w-3.5 h-3.5 text-[#B45309] dark:text-[#D97706]" />
              Chọn tệp TXT / MD
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {importMode === 'single' ? (
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                  Tiêu đề chương gốc
                </label>
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.CHAPTER_TITLE_MAX}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={parsedSingle.title}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                />
              </div>
            ) : (
              <div className="sm:col-span-3 flex items-end pb-1">
                <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">
                  Phát hiện{' '}
                  <strong className="font-mono-tabular text-[#B45309] dark:text-[#D97706]">
                    {parsedMulti.length}
                  </strong>{' '}
                  chương ({totalMultiParagraphs.toLocaleString('vi-VN')} đoạn) từ văn bản đầu vào.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                {importMode === 'multi' ? 'Thứ tự bắt đầu' : 'Thứ tự chương'}
              </label>
              <input
                type="number"
                min={1}
                max={100000}
                value={order}
                onChange={(e) => setOrder(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3.5 py-2 text-sm font-mono-tabular rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#6B6257] dark:text-[#A89F91]">
                Nội dung nguyên tác *
              </label>
              <span className="font-mono-tabular text-xs text-[#6B6257] dark:text-[#A89F91]">
                {importMode === 'multi'
                  ? `${parsedMulti.length} chương · ${totalMultiParagraphs} đoạn`
                  : `${parsedSingle.paragraphs.length} đoạn`}{' '}
                · {rawText.length.toLocaleString('vi-VN')} ký tự
              </span>
            </div>
            <textarea
              rows={importMode === 'multi' && parsedMulti.length > 0 ? 7 : 10}
              required
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={
                importMode === 'multi'
                  ? 'Dán toàn bộ nhiều chương (VD: 第一章 ...\n...\n第二章 ...) vào đây để tự động tách chương.'
                  : 'Dán nội dung chương tiếng Trung, Anh, Nhật, Hàn... vào đây.'
              }
              className="w-full px-3.5 py-3 text-sm font-literary leading-relaxed rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309] resize-y"
            />
          </div>

          {importMode === 'multi' && parsedMulti.length > 0 && (
            <div className="rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white/70 dark:bg-[#141210] p-3 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-2">
                Xem trước danh sách chương sẽ tạo:
              </p>
              <div className="divide-y divide-[#E4DDD0]/70 dark:divide-[#2E2924]/70 text-xs">
                {parsedMulti.slice(0, 50).map((ch) => (
                  <div key={ch.order} className="py-1.5 flex items-center justify-between gap-3">
                    <span className="truncate text-[#1F1C18] dark:text-[#EDE8DF]">
                      <span className="font-mono-tabular text-[#6B6257] dark:text-[#A89F91] mr-2">
                        #{ch.order}
                      </span>
                      {ch.titleSource}
                    </span>
                    <span className="font-mono-tabular text-[#6B6257] dark:text-[#A89F91] shrink-0">
                      {ch.paragraphs.length} đoạn
                    </span>
                  </div>
                ))}
                {parsedMulti.length > 50 && (
                  <p className="pt-2 text-[#6B6257] dark:text-[#A89F91]">
                    ...và {parsedMulti.length - 50} chương nữa
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#E4DDD0] dark:border-[#2E2924]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                (importMode === 'multi'
                  ? parsedMulti.length === 0
                  : parsedSingle.paragraphs.length === 0)
              }
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting
                ? 'Đang nhập dữ liệu...'
                : importMode === 'multi'
                  ? `Nhập ${parsedMulti.length} chương (${totalMultiParagraphs} đoạn)`
                  : `Tạo chương (${parsedSingle.paragraphs.length} đoạn)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

