import { useState } from 'react';
import { BookMarked, Download, Edit3, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { getLanguageLabel, SOURCE_LANGUAGES, TARGET_LANGUAGES } from '../constants/languages';
import { FIELD_LIMITS, type Chapter, type Novel, type Segment } from '../types';
import { formatWholeNovelExport, triggerFileDownload } from '../utils/chapterParser';
import { exportNovelToEpub } from '../utils/epubExporter';

interface LibraryViewProps {
  novels: Novel[];
  loading: boolean;
  activeNovelId: string | null;
  onSelectNovel: (novelId: string) => void;
  onCreateNovel: (input: {
    title: string;
    author: string;
    sourceLang: string;
    targetLang: string;
    styleInstruction: string;
  }) => Promise<string>;
  onUpdateNovel: (
    novelId: string,
    input: {
      title: string;
      author: string;
      sourceLang: string;
      targetLang: string;
      styleInstruction: string;
    }
  ) => Promise<void>;
  onDeleteNovel: (novelId: string) => Promise<void>;
  onCreateSampleNovel: () => Promise<void>;
  onFetchNovelExportData?: (
    novelId: string
  ) => Promise<Array<{ chapter: Chapter; segments: Segment[] }>>;
}

export function LibraryView({
  novels,
  loading,
  activeNovelId,
  onSelectNovel,
  onCreateNovel,
  onUpdateNovel,
  onDeleteNovel,
  onCreateSampleNovel,
  onFetchNovelExportData,
}: LibraryViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNovel, setEditingNovel] = useState<Novel | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [exportMenuNovelId, setExportMenuNovelId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creatingSample, setCreatingSample] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [sourceLang, setSourceLang] = useState('zh');
  const [targetLang, setTargetLang] = useState('vi');
  const [styleInstruction, setStyleInstruction] = useState('');

  const openCreateModal = () => {
    setEditingNovel(null);
    setTitle('');
    setAuthor('');
    setSourceLang('zh');
    setTargetLang('vi');
    setStyleInstruction(
      'Dịch mượt mà theo văn phong tiểu thuyết, giữ đúng xưng hô nhân vật và cấu trúc đối thoại tự nhiên.'
    );
    setModalOpen(true);
  };

  const openEditModal = (novel: Novel) => {
    setEditingNovel(novel);
    setTitle(novel.title);
    setAuthor(novel.author);
    setSourceLang(novel.sourceLang);
    setTargetLang(novel.targetLang);
    setStyleInstruction(novel.styleInstruction);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (editingNovel) {
        await onUpdateNovel(editingNovel.id, {
          title,
          author,
          sourceLang,
          targetLang,
          styleInstruction,
        });
      } else {
        const id = await onCreateNovel({
          title,
          author,
          sourceLang,
          targetLang,
          styleInstruction,
        });
        onSelectNovel(id);
      }
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSampleClick = async () => {
    if (creatingSample) return;
    setCreatingSample(true);
    try {
      await onCreateSampleNovel();
    } finally {
      setCreatingSample(false);
    }
  };

  const handleExportWholeNovel = async (
    novel: Novel,
    format: 'epub' | 'txt' | 'md',
    bilingual: boolean
  ) => {
    if (!onFetchNovelExportData || exportingId) return;
    setExportingId(novel.id);
    setExportMenuNovelId(null);
    try {
      const data = await onFetchNovelExportData(novel.id);
      if (data.length === 0) return;
      if (format === 'epub') {
        await exportNovelToEpub(novel, data, bilingual);
      } else {
        const content = formatWholeNovelExport(novel, data, format, bilingual);
        const safeName = novel.title.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'truyen';
        const suffix = bilingual ? '_song_ngu' : '';
        triggerFileDownload(`${safeName}${suffix}.${format}`, content);
      }
    } finally {
      setExportingId(null);
    }
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 lg:px-10 py-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-8 border-b border-[#E4DDD0] dark:border-[#2E2924]">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1F1C18] dark:text-[#EDE8DF] text-balance">
            Thư viện Tiểu thuyết
          </h1>
          <p className="mt-2 text-sm text-[#6B6257] dark:text-[#A89F91]">
            Quản lý đầu sách, cặp ngôn ngữ mặc định và chỉ dẫn văn phong riêng cho từng tác phẩm.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleSampleClick}
            disabled={creatingSample}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-[#B45309] dark:text-[#D97706]" />
            {creatingSample ? 'Đang tạo mẫu...' : 'Tạo truyện mẫu'}
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tạo tiểu thuyết mới
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-8">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-52 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/60 dark:bg-[#1C1917]/60 animate-pulse"
            />
          ))}
        </div>
      ) : novels.length === 0 ? (
        <div className="mt-12 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/50 dark:bg-[#1C1917]/50 p-12 text-center max-w-2xl mx-auto">
          <BookMarked className="w-9 h-9 mx-auto text-[#B45309] dark:text-[#D97706] mb-4" />
          <h2 className="font-display text-2xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF] mb-2">
            Chưa có dự án tiểu thuyết nào
          </h2>
          <p className="text-sm text-[#6B6257] dark:text-[#A89F91] leading-relaxed mb-6">
            Hãy tạo bộ truyện đầu tiên để bắt đầu nhập chương, thiết lập từ điển tên riêng và dịch
            bằng Index-Translate-9B, hoặc dùng truyện mẫu có sẵn 5 đoạn tiếng Trung và thuật ngữ.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Tạo tiểu thuyết mới
            </button>
            <button
              type="button"
              onClick={handleSampleClick}
              disabled={creatingSample}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors cursor-pointer whitespace-nowrap"
            >
              {creatingSample ? 'Đang khởi tạo...' : 'Dùng bộ truyện mẫu'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-8">
          {novels.map((novel) => {
            const isSelected = novel.id === activeNovelId;
            return (
              <article
                key={novel.id}
                className={`group relative rounded-xl border transition-colors duration-150 bg-[#F3EFE6]/55 dark:bg-[#1C1917]/80 p-5 flex gap-5 ${
                  isSelected
                    ? 'border-[#B45309] dark:border-[#D97706]'
                    : 'border-[#E4DDD0] dark:border-[#2E2924] hover:border-[#C7BCAE] dark:hover:border-[#443D36]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectNovel(novel.id)}
                  className="w-20 h-28 rounded-lg overflow-hidden border border-[#E4DDD0] dark:border-[#2E2924] shrink-0 bg-[#EAE3D5] dark:bg-[#26221E] cursor-pointer"
                >
                  {!coverFailed ? (
                    <img
                      src="/src/assets/images/novel_cover_classic_1795353149277.jpg"
                      alt={`Bìa ${novel.title}`}
                      referrerPolicy="no-referrer"
                      onError={() => setCoverFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2 text-center">
                      <BookMarked className="w-5 h-5 text-[#B45309] dark:text-[#D97706]" />
                    </div>
                  )}
                </button>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <button
                      type="button"
                      onClick={() => onSelectNovel(novel.id)}
                      className="text-left w-full cursor-pointer"
                    >
                      <h2 className="font-display text-lg font-semibold text-[#1F1C18] dark:text-[#EDE8DF] group-hover:text-[#B45309] dark:group-hover:text-[#D97706] transition-colors truncate">
                        {novel.title}
                      </h2>
                    </button>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6B6257] dark:text-[#A89F91]">
                      <span className="truncate max-w-[140px]">
                        {novel.author || 'Chưa rõ tác giả'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {novel.chapterCount} chương
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-[#6B6257] dark:text-[#A89F91]">
                      {getLanguageLabel(novel.sourceLang)} → {getLanguageLabel(novel.targetLang)}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#E4DDD0] dark:border-[#2E2924] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectNovel(novel.id)}
                      className="text-xs font-semibold text-[#B45309] dark:text-[#D97706] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      Mở phòng biên tập
                    </button>

                    <div className="flex items-center gap-1 relative">
                      {onFetchNovelExportData && novel.chapterCount > 0 && (
                        <button
                          type="button"
                          disabled={exportingId === novel.id}
                          onClick={() =>
                            setExportMenuNovelId((curr) => (curr === novel.id ? null : novel.id))
                          }
                          title="Xuất toàn bộ tiểu thuyết (EPUB / TXT / MD)"
                          className="p-2 rounded-md text-[#6B6257] dark:text-[#A89F91] hover:text-[#B45309] dark:hover:text-[#D97706] hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {exportMenuNovelId === novel.id && (
                        <div className="absolute right-0 bottom-9 z-20 w-48 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#1C1917] shadow-lg py-1 text-xs">
                          <button
                            type="button"
                            onClick={() => handleExportWholeNovel(novel, 'epub', false)}
                            className="w-full text-left px-3 py-2 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                          >
                            Xuất .EPUB (Bản dịch)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportWholeNovel(novel, 'epub', true)}
                            className="w-full text-left px-3 py-2 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                          >
                            Xuất .EPUB (Song ngữ)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportWholeNovel(novel, 'md', true)}
                            className="w-full text-left px-3 py-2 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                          >
                            Xuất .MD (Song ngữ)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportWholeNovel(novel, 'txt', false)}
                            className="w-full text-left px-3 py-2 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                          >
                            Xuất .TXT (Toàn bộ)
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => openEditModal(novel)}
                        title="Chỉnh sửa thông tin truyện"
                        className="p-2 rounded-md text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {confirmDeleteId === novel.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteNovel(novel.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-1 text-xs font-medium rounded bg-[#DC2626] text-white cursor-pointer"
                          >
                            Xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs rounded text-[#6B6257] dark:text-[#A89F91] cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(novel.id)}
                          title="Xóa tiểu thuyết"
                          className="p-2 rounded-md text-[#6B6257] dark:text-[#A89F91] hover:text-[#DC2626] dark:hover:text-[#F87171] hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Novel Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#1C1917] p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#E4DDD0] dark:border-[#2E2924]">
              <h2 className="font-display text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                {editingNovel ? 'Chỉnh sửa tiểu thuyết' : 'Tạo dự án tiểu thuyết mới'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                  Tên tiểu thuyết *
                </label>
                <input
                  type="text"
                  required
                  maxLength={FIELD_LIMITS.NOVEL_TITLE_MAX}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Phàm Nhân Tu Tiên"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309] dark:focus:border-[#D97706]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                  Tác giả
                </label>
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.NOVEL_AUTHOR_MAX}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Ví dụ: Vong Ngữ"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309] dark:focus:border-[#D97706]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                    Ngôn ngữ nguồn
                  </label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                  >
                    {SOURCE_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                    Ngôn ngữ đích
                  </label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                  >
                    {TARGET_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                  Chỉ dẫn văn phong mặc định (--instruction)
                </label>
                <textarea
                  rows={3}
                  maxLength={FIELD_LIMITS.STYLE_INSTRUCTION_MAX}
                  value={styleInstruction}
                  onChange={(e) => setStyleInstruction(e.target.value)}
                  placeholder="Ví dụ: Dịch theo văn phong tiên hiệp cổ trang, giữ xưng hô sư huynh/đệ, không bỏ sót thoại..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309] resize-y"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : editingNovel ? 'Lưu thay đổi' : 'Tạo tiểu thuyết'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
