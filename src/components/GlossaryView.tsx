import { useEffect, useMemo, useState } from 'react';
import {
  BookA,
  Copy,
  Download,
  FileUp,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { FIELD_LIMITS, type GlossaryCategory, type GlossaryTerm, type Novel } from '../types';
import {
  exportGlossaryJson,
  parseBulkGlossaryText,
  triggerFileDownload,
} from '../utils/chapterParser';
import {
  clearTranslationMemory,
  deleteTranslationMemoryEntry,
  getPronounRules,
  getTranslationMemory,
  savePronounRules,
  type PronounRule,
  type TranslationMemoryEntry,
} from '../utils/translationMemory';

interface GlossaryViewProps {
  novel: Novel | null;
  novels?: Novel[];
  terms: GlossaryTerm[];
  loading: boolean;
  onAddTerm: (input: {
    sourceTerm: string;
    targetTerm: string;
    category: GlossaryCategory;
  }) => Promise<void>;
  onBulkAddTerms: (
    entries: Array<{ sourceTerm: string; targetTerm: string; category: GlossaryCategory }>
  ) => Promise<void>;
  onCopyGlossaryFromNovel?: (sourceNovelId: string) => Promise<number>;
  onToggleTerm: (termId: string, enabled: boolean) => Promise<void>;
  onDeleteTerm: (termId: string) => Promise<void>;
  onGoToLibrary: () => void;
}

const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  character: 'Nhân vật',
  location: 'Địa danh',
  skill: 'Công pháp / Cảnh giới',
  other: 'Thuật ngữ khác',
};

type GlossaryTab = 'terms' | 'pronouns' | 'memory';

export function GlossaryView({
  novel,
  novels = [],
  terms,
  loading,
  onAddTerm,
  onBulkAddTerms,
  onCopyGlossaryFromNovel,
  onToggleTerm,
  onDeleteTerm,
  onGoToLibrary,
}: GlossaryViewProps) {
  const [activeTab, setActiveTab] = useState<GlossaryTab>('terms');
  const [sourceTerm, setSourceTerm] = useState('');
  const [targetTerm, setTargetTerm] = useState('');
  const [category, setCategory] = useState<GlossaryCategory>('character');
  const [filterCat, setFilterCat] = useState<GlossaryCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [saving, setSaving] = useState(false);

  // Copy from another novel
  const [copySourceId, setCopySourceId] = useState('');
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  // Pronoun matrix state
  const [pronounRules, setPronounRules] = useState<PronounRule[]>([]);
  const [speaker, setSpeaker] = useState('');
  const [listener, setListener] = useState('');
  const [selfPronoun, setSelfPronoun] = useState('');
  const [otherPronoun, setOtherPronoun] = useState('');
  const [pronounNote, setPronounNote] = useState('');

  // Translation Memory state
  const [memoryEntries, setMemoryEntries] = useState<TranslationMemoryEntry[]>([]);
  const [memoryQuery, setMemoryQuery] = useState('');

  useEffect(() => {
    if (!novel) {
      setPronounRules([]);
      setMemoryEntries([]);
      return;
    }
    setPronounRules(getPronounRules(novel.id));
    setMemoryEntries(getTranslationMemory(novel.id));
    setCopyMessage(null);
    const others = novels.filter((n) => n.id !== novel.id);
    setCopySourceId(others[0]?.id || '');
  }, [novel?.id, novels]);

  const otherNovels = useMemo(
    () => (novel ? novels.filter((n) => n.id !== novel.id) : []),
    [novels, novel]
  );

  const filteredTerms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return terms.filter((t) => {
      if (filterCat !== 'all' && t.category !== filterCat) return false;
      if (!q) return true;
      return t.sourceTerm.toLowerCase().includes(q) || t.targetTerm.toLowerCase().includes(q);
    });
  }, [terms, filterCat, searchQuery]);

  const filteredMemory = useMemo(() => {
    const q = memoryQuery.trim().toLowerCase();
    if (!q) return memoryEntries;
    return memoryEntries.filter(
      (m) =>
        m.sourceText.toLowerCase().includes(q) || m.translatedText.toLowerCase().includes(q)
    );
  }, [memoryEntries, memoryQuery]);

  if (!novel) {
    return (
      <main className="max-w-[1280px] mx-auto px-6 lg:px-10 py-16 text-center">
        <BookA className="w-9 h-9 mx-auto text-[#B45309] dark:text-[#D97706] mb-4" />
        <h1 className="font-display text-2xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF] mb-2">
          Chưa chọn tiểu thuyết
        </h1>
        <p className="text-sm text-[#6B6257] dark:text-[#A89F91] mb-6">
          Hãy chọn hoặc tạo một dự án tiểu thuyết trong Thư viện để quản lý từ điển thuật ngữ riêng.
        </p>
        <button
          type="button"
          onClick={onGoToLibrary}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white cursor-pointer"
        >
          Mở Thư viện
        </button>
      </main>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTerm.trim() || !targetTerm.trim() || saving) return;
    setSaving(true);
    try {
      await onAddTerm({
        sourceTerm: sourceTerm.trim(),
        targetTerm: targetTerm.trim(),
        category,
      });
      setSourceTerm('');
      setTargetTerm('');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseBulkGlossaryText(bulkText);
    if (parsed.length === 0 || saving) return;
    setSaving(true);
    try {
      await onBulkAddTerms(parsed);
      setBulkText('');
      setBulkOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setBulkText(text);
    setBulkOpen(true);
  };

  const handleExportTxt = () => {
    const content = terms.map((t) => `${t.sourceTerm}→${t.targetTerm}`).join('\n') + '\n';
    const safeName = novel.title.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    triggerFileDownload(`${safeName}_glossary.txt`, content);
  };

  const handleExportJson = () => {
    const content = exportGlossaryJson(terms);
    const safeName = novel.title.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    triggerFileDownload(`${safeName}_glossary.json`, content, 'application/json;charset=utf-8');
  };

  const handleCopyFromNovel = async () => {
    if (!copySourceId || !onCopyGlossaryFromNovel || saving) return;
    setSaving(true);
    setCopyMessage(null);
    try {
      const added = await onCopyGlossaryFromNovel(copySourceId);
      setCopyMessage(
        added > 0
          ? `Đã sao chép thêm ${added} thuật ngữ mới.`
          : 'Không có thuật ngữ mới nào (đã trùng lặp hoặc bộ truyện nguồn trống).'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddPronounRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!speaker.trim() || !listener.trim() || !selfPronoun.trim() || !otherPronoun.trim()) return;
    const nextRule: PronounRule = {
      id: `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      speaker: speaker.trim(),
      listener: listener.trim(),
      selfPronoun: selfPronoun.trim(),
      otherPronoun: otherPronoun.trim(),
      note: pronounNote.trim(),
    };
    const next = [nextRule, ...pronounRules];
    setPronounRules(next);
    savePronounRules(novel.id, next);
    setSpeaker('');
    setListener('');
    setSelfPronoun('');
    setOtherPronoun('');
    setPronounNote('');
  };

  const handleDeletePronounRule = (ruleId: string) => {
    const next = pronounRules.filter((r) => r.id !== ruleId);
    setPronounRules(next);
    savePronounRules(novel.id, next);
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#E4DDD0] dark:border-[#2E2924]">
        <div>
          <p className="text-xs font-medium text-[#B45309] dark:text-[#D97706] mb-1">
            Tri thức & Nhất quán · {novel.title}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1F1C18] dark:text-[#EDE8DF]">
            Thuật ngữ, Xưng hô & Bộ nhớ dịch
          </h1>
          <p className="mt-2 text-sm text-[#6B6257] dark:text-[#A89F91]">
            Giữ đồng bộ tên riêng, quy tắc xưng hô theo cặp nhân vật và các câu mẫu đã duyệt cho
            Index-Translate.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#1C1917] border border-[#E4DDD0] dark:border-[#2E2924] shrink-0 self-start md:self-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'terms'
                ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                : 'text-[#6B6257] dark:text-[#A89F91]'
            }`}
          >
            Từ điển ({terms.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pronouns')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'pronouns'
                ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                : 'text-[#6B6257] dark:text-[#A89F91]'
            }`}
          >
            Xưng hô nhân vật ({pronounRules.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setMemoryEntries(getTranslationMemory(novel.id));
              setActiveTab('memory');
            }}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'memory'
                ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                : 'text-[#6B6257] dark:text-[#A89F91]'
            }`}
          >
            Bộ nhớ dịch ({memoryEntries.length})
          </button>
        </div>
      </div>

      {activeTab === 'terms' ? (
        <>
          {/* Glossary Actions Toolbar */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setBulkOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 text-[#B45309] dark:text-[#D97706]" />
                Nhập hàng loạt (.TXT / .JSON)
              </button>
              <button
                type="button"
                onClick={handleExportTxt}
                disabled={terms.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Xuất .TXT
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                disabled={terms.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Xuất .JSON
              </button>
            </div>

            {otherNovels.length > 0 && onCopyGlossaryFromNovel && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[#6B6257] dark:text-[#A89F91]">Kế thừa từ:</span>
                <select
                  value={copySourceId}
                  onChange={(e) => setCopySourceId(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] max-w-[200px]"
                >
                  {otherNovels.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving || !copySourceId}
                  onClick={handleCopyFromNovel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg border border-[#B45309] dark:border-[#D97706] text-[#B45309] dark:text-[#D97706] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Sao chép thuật ngữ
                </button>
              </div>
            )}
          </div>

          {copyMessage && (
            <p className="mt-3 text-xs text-[#15803D] dark:text-[#4ADE80]">{copyMessage}</p>
          )}

          {/* Add single term form */}
          <form
            onSubmit={handleAdd}
            className="mt-6 p-5 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/55 dark:bg-[#1C1917]/80 grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
          >
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                Từ nguyên tác (VD: 韩立)
              </label>
              <input
                type="text"
                required
                maxLength={FIELD_LIMITS.GLOSSARY_TERM_MAX}
                value={sourceTerm}
                onChange={(e) => setSourceTerm(e.target.value)}
                placeholder="Nhập từ gốc..."
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                Nghĩa dịch cố định (VD: Hàn Lập)
              </label>
              <input
                type="text"
                required
                maxLength={FIELD_LIMITS.GLOSSARY_TERM_MAX}
                value={targetTerm}
                onChange={(e) => setTargetTerm(e.target.value)}
                placeholder="Nhập nghĩa dịch..."
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                Nhóm
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as GlossaryCategory)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
              >
                <option value="character">Nhân vật</option>
                <option value="location">Địa danh</option>
                <option value="skill">Công pháp / Cảnh giới</option>
                <option value="other">Thuật ngữ khác</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving || !sourceTerm.trim() || !targetTerm.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Thêm từ
              </button>
            </div>
          </form>

          {/* Bulk import panel */}
          {bulkOpen && (
            <form
              onSubmit={handleBulkSubmit}
              className="mt-4 p-5 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/40 dark:bg-[#1C1917]/60 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">
                  Hỗ trợ danh sách <span className="font-mono-tabular">Từ gốc→Nghĩa dịch</span> hoặc
                  dán/tải tệp <span className="font-mono-tabular">.JSON</span>.
                </p>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309] dark:text-[#D97706] cursor-pointer hover:underline">
                  <FileUp className="w-3.5 h-3.5" />
                  Nạp từ tệp .txt / .json
                  <input type="file" accept=".txt,.json" onChange={handleBulkFile} className="hidden" />
                </label>
              </div>
              <textarea
                rows={5}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'林尘→Lâm Trần\n青云宗:Thanh Vân Tông\nhoặc [{"sourceTerm":"筑基期","targetTerm":"Trúc Cơ kỳ","category":"skill"}]'}
                className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setBulkOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={saving || parseBulkGlossaryText(bulkText).length === 0}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] text-white cursor-pointer disabled:opacity-50"
                >
                  Nhập {parseBulkGlossaryText(bulkText).length} thuật ngữ
                </button>
              </div>
            </form>
          )}

          {/* Filter + Search bar */}
          <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#1C1917] border border-[#E4DDD0] dark:border-[#2E2924] overflow-x-auto">
              {(['all', 'character', 'location', 'skill', 'other'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    filterCat === cat
                      ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                      : 'text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF]'
                  }`}
                >
                  {cat === 'all' ? `Tất cả (${terms.length})` : CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#6B6257] dark:text-[#A89F91] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm từ gốc hoặc nghĩa dịch..."
                className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="mt-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-[#6B6257] dark:text-[#A89F91]">
                Đang tải bảng thuật ngữ...
              </div>
            ) : filteredTerms.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#6B6257] dark:text-[#A89F91]">
                {terms.length === 0
                  ? 'Chưa có thuật ngữ nào. Thêm cặp tên riêng phía trên để mô hình giữ thống nhất khi dịch.'
                  : 'Không tìm thấy thuật ngữ phù hợp.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/70 dark:bg-[#1C1917] text-xs font-medium text-[#6B6257] dark:text-[#A89F91]">
                      <th className="py-3 px-4 w-16">Áp dụng</th>
                      <th className="py-3 px-4">Nguyên tác</th>
                      <th className="py-3 px-4">Nghĩa dịch chuẩn</th>
                      <th className="py-3 px-4">Phân loại</th>
                      <th className="py-3 px-4 text-right w-20">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4DDD0] dark:divide-[#2E2924] text-sm">
                    {filteredTerms.map((term) => (
                      <tr
                        key={term.id}
                        className="hover:bg-[#F3EFE6]/45 dark:hover:bg-[#1C1917]/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={term.enabled}
                            onChange={() => onToggleTerm(term.id, !term.enabled)}
                            aria-label={`Bật thuật ngữ ${term.sourceTerm}`}
                            className="w-4 h-4 accent-[#B45309] dark:accent-[#D97706] cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 font-literary font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                          {term.sourceTerm}
                        </td>
                        <td className="py-3 px-4 font-literary text-[#B45309] dark:text-[#D97706] font-medium">
                          {term.targetTerm}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#6B6257] dark:text-[#A89F91]">
                          {CATEGORY_LABELS[term.category]}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteTerm(term.id)}
                            title="Xóa thuật ngữ"
                            className="p-1.5 rounded text-[#6B6257] dark:text-[#A89F91] hover:text-[#DC2626] dark:hover:text-[#F87171] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'pronouns' ? (
        <section className="mt-6 space-y-6">
          <div className="p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/40 dark:bg-[#1C1917]/60 text-xs text-[#6B6257] dark:text-[#A89F91] leading-relaxed">
            Khi hai nhân vật cùng xuất hiện trong một đoạn văn (theo tên tiếng Việt trong từ điển
            hoặc tên gốc), Mặc Vận sẽ tự động chèn quy tắc xưng hô tương ứng vào{' '}
            <span className="font-mono-tabular">--instruction</span> của Index-Translate để tránh
            lỗi đổi ngôi “ta/ngươi – huynh/muội – tôi/cô”.
          </div>

          <form
            onSubmit={handleAddPronounRule}
            className="p-5 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/55 dark:bg-[#1C1917]/80 grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
          >
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                Người nói (A) *
              </label>
              <input
                type="text"
                required
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                placeholder="VD: Lâm Trần"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                Người nghe (B) *
              </label>
              <input
                type="text"
                required
                value={listener}
                onChange={(e) => setListener(e.target.value)}
                placeholder="VD: Sư huynh"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                A tự xưng *
              </label>
              <input
                type="text"
                required
                value={selfPronoun}
                onChange={(e) => setSelfPronoun(e.target.value)}
                placeholder="VD: đệ / tại hạ"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                A gọi B *
              </label>
              <input
                type="text"
                required
                value={otherPronoun}
                onChange={(e) => setOtherPronoun(e.target.value)}
                placeholder="VD: sư huynh"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                Ghi chú ngữ khí
              </label>
              <input
                type="text"
                value={pronounNote}
                onChange={(e) => setPronounNote(e.target.value)}
                placeholder="kính trọng, thân mật..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210]"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] text-white cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Thêm cặp
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] overflow-hidden">
            {pronounRules.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#6B6257] dark:text-[#A89F91]">
                Chưa có quy tắc xưng hô nào cho bộ truyện này.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/70 dark:bg-[#1C1917] text-xs font-medium text-[#6B6257] dark:text-[#A89F91]">
                    <th className="py-3 px-4">Người nói</th>
                    <th className="py-3 px-4">Người nghe</th>
                    <th className="py-3 px-4">Xưng hô</th>
                    <th className="py-3 px-4">Ghi chú</th>
                    <th className="py-3 px-4 text-right w-20">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4DDD0] dark:divide-[#2E2924] text-sm">
                  {pronounRules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="py-3 px-4 font-medium">{rule.speaker}</td>
                      <td className="py-3 px-4">{rule.listener}</td>
                      <td className="py-3 px-4 text-[#B45309] dark:text-[#D97706] font-medium">
                        {rule.selfPronoun} – {rule.otherPronoun}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#6B6257] dark:text-[#A89F91]">
                        {rule.note || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeletePronounRule(rule.id)}
                          className="p-1.5 rounded text-[#6B6257] hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : (
        <section className="mt-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">
              Tự động ghi nhớ các đoạn văn bạn đã bấm “Duyệt” trong Biên tập để gợi ý tái sử dụng khi
              gặp câu lặp hoặc đoạn tương tự.
            </p>
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-[#6B6257] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={memoryQuery}
                  onChange={(e) => setMemoryQuery(e.target.value)}
                  placeholder="Tìm trong bộ nhớ dịch..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210]"
                />
              </div>
              {memoryEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearTranslationMemory(novel.id);
                    setMemoryEntries([]);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626]/10 cursor-pointer whitespace-nowrap"
                >
                  Xóa toàn bộ
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] divide-y divide-[#E4DDD0] dark:divide-[#2E2924]">
            {filteredMemory.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#6B6257] dark:text-[#A89F91]">
                Chưa có bản ghi Bộ nhớ dịch nào. Hãy bấm “Duyệt” các đoạn đã dịch chuẩn trong phòng
                Biên tập để lưu vào bộ nhớ.
              </div>
            ) : (
              filteredMemory.map((item) => (
                <div key={item.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 text-sm">
                    <p className="font-literary text-[#6B6257] dark:text-[#A89F91]">
                      {item.sourceText}
                    </p>
                    <p className="font-literary text-[#1F1C18] dark:text-[#EDE8DF]">
                      {item.translatedText}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMemoryEntries(deleteTranslationMemoryEntry(novel.id, item.id));
                    }}
                    className="p-1.5 rounded text-[#6B6257] hover:text-[#DC2626] cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}

