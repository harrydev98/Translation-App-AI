import { useState } from 'react';
import { CheckCircle2, Cpu, Minus, Plus, RotateCcw, ServerCrash, Type } from 'lucide-react';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_MODEL,
  INDEX_TRANSLATE_MODELS,
} from '../constants/languages';
import {
  testTranslationApiConnection,
  type ConnectionTestResult,
} from '../services/translateClient';
import { FIELD_LIMITS, type UserSettings } from '../types';
import {
  applyTypographyConfig,
  DEFAULT_TYPOGRAPHY_CONFIG,
  DISPLAY_FONT_OPTIONS,
  LITERARY_FONT_OPTIONS,
  loadTypographyConfig,
  MONO_FONT_OPTIONS,
  saveTypographyConfig,
  TYPOGRAPHY_PRESETS,
  UI_FONT_OPTIONS,
  type TypographyConfig,
} from '../utils/typographySettings';

interface SettingsViewProps {
  settings: UserSettings;
  sessionApiKey: string;
  onSessionApiKeyChange: (key: string) => void;
  onSaveSettings: (partial: { apiBaseUrl?: string; apiModel?: string }) => Promise<void>;
}

const DISPLAY_PREVIEW_CLASS: Record<string, string> = {
  fraunces: 'font-preview-fraunces',
  playfair: 'font-preview-playfair',
  cormorant: 'font-preview-cormorant',
  'plus-jakarta-display': 'font-preview-plus-jakarta',
  'manrope-display': 'font-preview-manrope',
};

const LITERARY_PREVIEW_CLASS: Record<string, string> = {
  'source-serif': 'font-preview-source-serif',
  lora: 'font-preview-lora',
  'noto-serif': 'font-preview-noto-serif',
  merriweather: 'font-preview-merriweather',
  'be-vietnam-prose': 'font-preview-be-vietnam',
};

type SettingsTab = 'all' | 'typography' | 'api';

export function SettingsView({
  settings,
  sessionApiKey,
  onSessionApiKeyChange,
  onSaveSettings,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('all');

  // Typography state (live applied across whole app)
  const [typography, setTypography] = useState<TypographyConfig>(() => loadTypographyConfig());
  const [fontSavedNotice, setFontSavedNotice] = useState(false);

  // API & Model state
  const [baseUrl, setBaseUrl] = useState(settings.apiBaseUrl || DEFAULT_API_BASE_URL);
  const [model, setModel] = useState(settings.apiModel || DEFAULT_MODEL);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const commitTypography = (next: TypographyConfig) => {
    setTypography(next);
    applyTypographyConfig(next);
    saveTypographyConfig(next);
    setFontSavedNotice(true);
    window.setTimeout(() => setFontSavedNotice(false), 1800);
  };

  const handleSelectPreset = (presetId: string) => {
    const found = TYPOGRAPHY_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    commitTypography({
      presetId: found.id,
      ...found.config,
    });
  };

  const handlePatchTypography = (partial: Partial<TypographyConfig>) => {
    commitTypography({
      ...typography,
      presetId: 'custom',
      ...partial,
    });
  };

  const handleResetTypography = () => {
    commitTypography(DEFAULT_TYPOGRAPHY_CONFIG);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSaveSettings({
        apiBaseUrl: baseUrl.trim() || DEFAULT_API_BASE_URL,
        apiModel: model.trim() || DEFAULT_MODEL,
      });
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testTranslationApiConnection({
        baseUrl: baseUrl.trim() || DEFAULT_API_BASE_URL,
        model: model.trim() || DEFAULT_MODEL,
        apiKey: sessionApiKey,
      });
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  const handleResetDefaults = () => {
    setBaseUrl(DEFAULT_API_BASE_URL);
    setModel(DEFAULT_MODEL);
    setSavedNotice(false);
  };

  const selectedUiDesc =
    UI_FONT_OPTIONS.find((f) => f.id === typography.sansFont)?.description || '';
  const selectedDisplayDesc =
    DISPLAY_FONT_OPTIONS.find((f) => f.id === typography.displayFont)?.description || '';
  const selectedLiteraryDesc =
    LITERARY_FONT_OPTIONS.find((f) => f.id === typography.literaryFont)?.description || '';
  const selectedMonoDesc =
    MONO_FONT_OPTIONS.find((f) => f.id === typography.monoFont)?.description || '';

  return (
    <main className="max-w-[980px] mx-auto px-6 lg:px-10 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-[#E4DDD0] dark:border-[#2E2924]">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#1F1C18] dark:text-[#EDE8DF]">
            Cài đặt Hệ thống Font chữ &amp; API
          </h1>
          <p className="mt-2 text-sm text-[#6B6257] dark:text-[#A89F91]">
            Tùy biến hệ thống kiểu chữ cho toàn bộ ứng dụng và cấu hình điểm cuối Index-Translate.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#1C1917] border border-[#E4DDD0] dark:border-[#2E2924] self-start md:self-auto shrink-0">
          {(
            [
              { id: 'all', label: 'Tất cả' },
              { id: 'typography', label: 'Font chữ' },
              { id: 'api', label: 'Mô hình & API' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                  : 'text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: App-wide Typography System */}
      {(activeTab === 'all' || activeTab === 'typography') && (
        <section className="mt-8 space-y-8 pb-10 border-b border-[#E4DDD0] dark:border-[#2E2924]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-[#B45309] dark:text-[#D97706]" />
                <h2 className="font-display text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  Hệ thống Font chữ toàn ứng dụng
                </h2>
              </div>
              <p className="mt-1 text-xs text-[#6B6257] dark:text-[#A89F91]">
                Phân bổ đồng bộ 4 lớp chữ (Giao diện, Tiêu đề, Văn học, Số liệu kỹ thuật) và áp dụng
                ngay lập tức cho mọi màn hình.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {fontSavedNotice && (
                <span className="text-xs font-medium text-[#15803D] dark:text-[#4ADE80]">
                  Đã áp dụng toàn app
                </span>
              )}
              <button
                type="button"
                onClick={handleResetTypography}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Khôi phục font mặc định
              </button>
            </div>
          </div>

          {/* 01. Presets */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#6B6257] dark:text-[#A89F91]">
              01. Bộ phối kiểu chữ nhanh
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {TYPOGRAPHY_PRESETS.map((preset) => {
                const isActive = typography.presetId === preset.id;
                const displayClass = DISPLAY_PREVIEW_CLASS[preset.config.displayFont] || '';
                const literaryClass = LITERARY_PREVIEW_CLASS[preset.config.literaryFont] || '';

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`text-left p-4 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? 'border-[#B45309] dark:border-[#D97706] bg-[#F3EFE6] dark:bg-[#1C1917]'
                        : 'border-[#E4DDD0] dark:border-[#2E2924] hover:border-[#C7BCAE] dark:hover:border-[#443D36]'
                    }`}
                  >
                    <div>
                      <p
                        className={`text-base font-semibold text-[#1F1C18] dark:text-[#EDE8DF] ${displayClass}`}
                      >
                        {preset.name}
                      </p>
                      <p
                        className={`mt-1.5 text-xs text-[#6B6257] dark:text-[#A89F91] leading-relaxed ${literaryClass}`}
                      >
                        “Trăng thanh gió mát, kiếm ảnh lung linh.”
                      </p>
                    </div>
                    <p className="mt-3 pt-2 border-t border-[#E4DDD0]/70 dark:border-[#2E2924]/70 text-[11px] font-mono-tabular text-[#B45309] dark:text-[#D97706] truncate">
                      {preset.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 02. 4 Typographic Roles */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#6B6257] dark:text-[#A89F91]">
              02. Tùy chỉnh từng vai trò chữ
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#141210] space-y-2">
                <label className="block text-xs font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  Font Giao diện (Menu, nút bấm, nhãn điều khiển)
                </label>
                <select
                  value={typography.sansFont}
                  onChange={(e) => handlePatchTypography({ sansFont: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                >
                  {UI_FONT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#6B6257] dark:text-[#A89F91]">{selectedUiDesc}</p>
              </div>

              <div className="p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#141210] space-y-2">
                <label className="block text-xs font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  Font Tiêu đề (Tên sách, tiêu đề chương, đầu mục)
                </label>
                <select
                  value={typography.displayFont}
                  onChange={(e) => handlePatchTypography({ displayFont: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                >
                  {DISPLAY_FONT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#6B6257] dark:text-[#A89F91]">
                  {selectedDisplayDesc}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#141210] space-y-2">
                <label className="block text-xs font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  Font Văn học (Nguyên tác, khung dịch, chế độ đọc)
                </label>
                <select
                  value={typography.literaryFont}
                  onChange={(e) => handlePatchTypography({ literaryFont: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                >
                  {LITERARY_FONT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#6B6257] dark:text-[#A89F91]">
                  {selectedLiteraryDesc}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#141210] space-y-2">
                <label className="block text-xs font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  Font Số liệu &amp; Kỹ thuật (Số đoạn, JSON, SRT, API)
                </label>
                <select
                  value={typography.monoFont}
                  onChange={(e) => handlePatchTypography({ monoFont: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                >
                  {MONO_FONT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#6B6257] dark:text-[#A89F91]">{selectedMonoDesc}</p>
              </div>
            </div>
          </div>

          {/* 03. Scale & Reading Rhythm */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#6B6257] dark:text-[#A89F91]">
              03. Cỡ chữ &amp; Nhịp giãn dòng
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* UI Font Size */}
              <div className="p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                    Cỡ chữ giao diện
                  </span>
                  <span className="font-mono-tabular text-[#B45309] dark:text-[#D97706]">
                    {typography.uiFontSizePx}px
                  </span>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#1C1917]">
                  {[14, 15, 16, 17, 18].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => handlePatchTypography({ uiFontSizePx: sz })}
                      className={`flex-1 py-1.5 text-xs font-mono-tabular rounded-md transition-colors cursor-pointer ${
                        typography.uiFontSizePx === sz
                          ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF] font-semibold'
                          : 'text-[#6B6257] dark:text-[#A89F91]'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Literary Font Size */}
              <div className="p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                    Cỡ chữ truyện &amp; dịch
                  </span>
                  <span className="font-mono-tabular text-[#B45309] dark:text-[#D97706]">
                    {typography.literaryFontSizePx}px
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handlePatchTypography({
                        literaryFontSizePx: Math.max(14, typography.literaryFontSizePx - 1),
                      })
                    }
                    disabled={typography.literaryFontSizePx <= 14}
                    aria-label="Giảm cỡ chữ truyện"
                    className="p-2 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-40"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="range"
                    min={14}
                    max={22}
                    step={1}
                    value={typography.literaryFontSizePx}
                    onChange={(e) =>
                      handlePatchTypography({ literaryFontSizePx: Number(e.target.value) })
                    }
                    className="flex-1 accent-[#B45309] dark:accent-[#D97706] cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handlePatchTypography({
                        literaryFontSizePx: Math.min(22, typography.literaryFontSizePx + 1),
                      })
                    }
                    disabled={typography.literaryFontSizePx >= 22}
                    aria-label="Tăng cỡ chữ truyện"
                    className="p-2 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Literary Line Height */}
              <div className="p-4 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                    Giãn dòng đọc văn bản
                  </span>
                  <span className="font-mono-tabular text-[#B45309] dark:text-[#D97706]">
                    {typography.literaryLineHeight}
                  </span>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#1C1917]">
                  {[1.5, 1.65, 1.75, 1.85, 2.0].map((lh) => (
                    <button
                      key={lh}
                      type="button"
                      onClick={() => handlePatchTypography({ literaryLineHeight: lh })}
                      className={`flex-1 py-1.5 text-xs font-mono-tabular rounded-md transition-colors cursor-pointer ${
                        typography.literaryLineHeight === lh
                          ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF] font-semibold'
                          : 'text-[#6B6257] dark:text-[#A89F91]'
                      }`}
                    >
                      {lh}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 04. Live Specimen */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#6B6257] dark:text-[#A89F91]">
              04. Bản xem trước trực tiếp (Toàn bộ 4 lớp chữ)
            </h3>
            <div className="p-6 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/45 dark:bg-[#1C1917]/70 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6257] dark:text-[#A89F91]">
                <span>Chế độ đối chiếu song ngữ · Chương mẫu</span>
                <span className="font-mono-tabular">
                  UI {typography.uiFontSizePx}px · Văn bản {typography.literaryFontSizePx}px /{' '}
                  {typography.literaryLineHeight}
                </span>
              </div>

              <h4 className="font-display text-2xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                Chương 01: Sương Lạnh Đỉnh Thanh Vân
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-[#E4DDD0]/70 dark:border-[#2E2924]/70">
                <p className="font-literary-prose text-[#6B6257] dark:text-[#A89F91]">
                  夜色深沉，青霜剑微微震颤，仿佛感应到了山巅之上的异动。林尘收起灵石，缓步踏入迷雾之中。
                </p>
                <p className="font-literary-prose text-[#1F1C18] dark:text-[#EDE8DF]">
                  Màn đêm buông xuống trầm mặc, thanh Thanh Sương Kiếm khẽ rung lên như cảm nhận được
                  dị động trên đỉnh núi. Lâm Trần thu hồi linh thạch, chậm rãi bước vào làn sương mù.
                </p>
              </div>

              <p className="pt-2 border-t border-[#E4DDD0]/70 dark:border-[#2E2924]/70 font-mono-tabular text-xs text-[#6B6257] dark:text-[#A89F91]">
                {`{"segment": 1, "glossary": ["青霜剑→Thanh Sương Kiếm"], "model": "${model}"}`}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 2: Model & API Configuration */}
      {(activeTab === 'all' || activeTab === 'api') && (
        <section className="mt-8 space-y-8">
          <div>
            <h2 className="font-display text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
              Cấu hình Mô hình &amp; API Dịch thuật
            </h2>
            <p className="mt-1 text-xs text-[#6B6257] dark:text-[#A89F91]">
              Kết nối trực tiếp tới máy chủ công khai của Bilibili Index-Translate hoặc điểm cuối tự
              host tương thích chuẩn OpenAI (như{' '}
              <span className="font-mono-tabular">call_api.py --serve</span>).
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-8">
            {/* Model selection */}
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                Chọn mô hình Index-Translate (hỗ trợ cả Văn bản &amp; Dịch ảnh Zero-OCR)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {INDEX_TRANSLATE_MODELS.map((item) => {
                  const active = model === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setModel(item.id)}
                      className={`text-left p-4 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between ${
                        active
                          ? 'border-[#B45309] dark:border-[#D97706] bg-[#F3EFE6] dark:bg-[#1C1917]'
                          : 'border-[#E4DDD0] dark:border-[#2E2924] hover:border-[#C7BCAE] dark:hover:border-[#443D36]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono-tabular text-sm font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                            {item.label}
                          </span>
                          <Cpu
                            className={`w-4 h-4 shrink-0 ${
                              active ? 'text-[#B45309] dark:text-[#D97706]' : 'text-[#6B6257]'
                            }`}
                          />
                        </div>
                        <p className="font-mono-tabular text-[11px] text-[#B45309] dark:text-[#D97706] mb-2">
                          {item.scale} · {item.contextInfo}
                        </p>
                        <p className="text-xs text-[#6B6257] dark:text-[#A89F91] leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                      <p className="mt-3 pt-2.5 border-t border-[#E4DDD0]/70 dark:border-[#2E2924]/70 text-[11px] text-[#6B6257] dark:text-[#A89F91]">
                        {item.capabilities.join(' · ')}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                  Tên mô hình tùy chỉnh
                </label>
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.API_MODEL_MAX}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                />
              </div>
            </div>

            {/* Endpoint settings */}
            <div className="pt-6 border-t border-[#E4DDD0] dark:border-[#2E2924] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-sm font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  API Base URL (Chuẩn OpenAI /chat/completions)
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setBaseUrl(DEFAULT_API_BASE_URL)}
                    className="text-[#B45309] dark:text-[#D97706] hover:underline cursor-pointer"
                  >
                    Dùng API công khai Bilibili
                  </button>
                  <span aria-hidden="true" className="text-[#C7BCAE]">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => setBaseUrl('http://127.0.0.1:8080/v1')}
                    className="text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:underline cursor-pointer"
                  >
                    Proxy cục bộ (8080)
                  </button>
                </div>
              </div>

              <input
                type="url"
                maxLength={FIELD_LIMITS.API_URL_MAX}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={DEFAULT_API_BASE_URL}
                className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
              />

              <div>
                <label className="block text-xs font-medium text-[#6B6257] dark:text-[#A89F91] mb-1.5">
                  API Key tùy chọn (chỉ giữ trong phiên trình duyệt hiện tại, để trống với API công
                  khai Bilibili)
                </label>
                <input
                  type="password"
                  value={sessionApiKey}
                  onChange={(e) => onSessionApiKeyChange(e.target.value)}
                  placeholder="Không bắt buộc với index-translate.bilibili.com"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[#E4DDD0] dark:border-[#2E2924]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="px-4 py-2.5 text-sm font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối API'}
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Mặc định API
                </button>
              </div>

              <div className="flex items-center gap-3">
                {savedNotice && (
                  <span className="text-xs font-medium text-[#15803D] dark:text-[#4ADE80]">
                    Đã lưu cấu hình lên đám mây
                  </span>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu cấu hình API'}
                </button>
              </div>
            </div>
          </form>

          {/* Connection Test Result */}
          {testResult && (
            <div className="p-5 rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/60 dark:bg-[#1C1917]">
              {testResult.ok ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#15803D] dark:text-[#4ADE80]">
                      <CheckCircle2 className="w-4 h-4" />
                      Kết nối thành công tới {testResult.model}
                    </div>
                    <span className="font-mono-tabular text-xs text-[#6B6257] dark:text-[#A89F91]">
                      {testResult.latencyMs} ms
                    </span>
                  </div>
                  <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">
                    Bản dịch thử từ câu mẫu tiếng Trung:
                  </p>
                  <p className="font-literary-prose text-[#1F1C18] dark:text-[#EDE8DF] pt-1">
                    “{testResult.sample}”
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 text-sm text-[#DC2626] dark:text-[#F87171]">
                  <ServerCrash className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Không thể kết nối tới API dịch</p>
                    <p className="text-xs mt-1 opacity-90">{testResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Index-Translate Ecosystem Reference */}
          <div className="pt-8 border-t border-[#E4DDD0] dark:border-[#2E2924] space-y-4">
            <div>
              <h3 className="font-display text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                Năng lực các mô hình trong hệ sinh thái Bilibili Index-Translate
              </h3>
              <p className="text-xs text-[#6B6257] dark:text-[#A89F91] mt-1">
                Dòng mô hình mở xây dựng trên kiến trúc Qwen3.5, hỗ trợ hơn 150 ngôn ngữ, tuân thủ
                ràng buộc thuật ngữ &amp; định dạng (instTrans), và xử lý hình ảnh không cần OCR.
              </p>
            </div>

            <div className="rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/70 dark:bg-[#1C1917] text-[#6B6257] dark:text-[#A89F91]">
                    <th className="py-2.5 px-4 font-medium">Mô hình</th>
                    <th className="py-2.5 px-4 font-medium">Khả năng nổi bật</th>
                    <th className="py-2.5 px-4 font-medium">Trạng thái trong ứng dụng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4DDD0] dark:divide-[#2E2924]">
                  <tr>
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                      Index-Translate-2B / 9B / 35B-A3B
                    </td>
                    <td className="py-3 px-4 text-[#6B6257] dark:text-[#A89F91]">
                      Dịch văn bản 150+ ngôn ngữ · Dịch ảnh trực tiếp (Zero-OCR) · Ràng buộc Glossary
                      A→B · Giữ cấu trúc JSON / Markdown / SRT · Giữ mạch ngữ cảnh chương dài
                    </td>
                    <td className="py-3 px-4 font-medium text-[#15803D] dark:text-[#4ADE80]">
                      Tích hợp đầy đủ qua API
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                      Index-NativeLong
                    </td>
                    <td className="py-3 px-4 text-[#6B6257] dark:text-[#A89F91]">
                      Biến thể chuyên dịch tài liệu nguyên cuốn và đồng bộ xưng hô xuyên suốt ngữ
                      cảnh rất dài
                    </td>
                    <td className="py-3 px-4 text-[#6B6257] dark:text-[#A89F91]">
                      Mô phỏng qua Ngữ cảnh trượt &amp; 35B-A3B
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                      Index-Echo / Index-Homura
                    </td>
                    <td className="py-3 px-4 text-[#6B6257] dark:text-[#A89F91]">
                      Dịch giọng nói sang văn bản/giọng nói (S2TT/S2ST giữ âm sắc) và kiểm soát số
                      âm tiết khi lồng tiếng video
                    </td>
                    <td className="py-3 px-4 text-[#6B6257] dark:text-[#A89F91]">
                      Checkpoint âm thanh chuyên biệt (tự host)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
