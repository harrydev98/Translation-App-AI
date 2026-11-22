export interface FontChoice {
  id: string;
  label: string;
  cssFamily: string;
  description: string;
}

export interface TypographyConfig {
  presetId: string;
  sansFont: string;
  displayFont: string;
  literaryFont: string;
  monoFont: string;
  uiFontSizePx: number;
  literaryFontSizePx: number;
  literaryLineHeight: number;
}

export interface TypographyPreset {
  id: string;
  name: string;
  subtitle: string;
  config: Omit<TypographyConfig, 'presetId'>;
}

export const UI_FONT_OPTIONS: FontChoice[] = [
  {
    id: 'plus-jakarta',
    label: 'Plus Jakarta Sans',
    cssFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    description: 'Cân đối, hiện đại, chuẩn mực biên tập (Mặc định)',
  },
  {
    id: 'be-vietnam',
    label: 'Be Vietnam Pro',
    cssFamily: "'Be Vietnam Pro', system-ui, -apple-system, sans-serif",
    description: 'Tối ưu dấu tiếng Việt sắc nét ở mọi cỡ chữ nhỏ',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    cssFamily: "'Manrope', system-ui, -apple-system, sans-serif",
    description: 'Hình học gọn gàng, mật độ thanh công cụ cao',
  },
  {
    id: 'public-sans',
    label: 'Public Sans',
    cssFamily: "'Public Sans', system-ui, -apple-system, sans-serif",
    description: 'Trung tính, độ tương phản rõ cho bảng biểu',
  },
];

export const DISPLAY_FONT_OPTIONS: FontChoice[] = [
  {
    id: 'fraunces',
    label: 'Fraunces',
    cssFamily: "'Fraunces', Georgia, serif",
    description: 'Serif mềm mại, giàu chất văn học đương đại (Mặc định)',
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    cssFamily: "'Playfair Display', Georgia, serif",
    description: 'Trang trọng, đậm chất bìa sách tiểu thuyết cổ điển',
  },
  {
    id: 'cormorant',
    label: 'Cormorant Garamond',
    cssFamily: "'Cormorant Garamond', Georgia, serif",
    description: 'Thanh mảnh, cổ phong hợp kiếm hiệp / tiên hiệp',
  },
  {
    id: 'plus-jakarta-display',
    label: 'Plus Jakarta Sans',
    cssFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    description: 'Sans-serif tinh gọn, hiện đại đồng nhất với giao diện',
  },
  {
    id: 'manrope-display',
    label: 'Manrope',
    cssFamily: "'Manrope', system-ui, sans-serif",
    description: 'Sắc nét, dứt khoát cho studio dịch hiện đại',
  },
];

export const LITERARY_FONT_OPTIONS: FontChoice[] = [
  {
    id: 'source-serif',
    label: 'Source Serif 4',
    cssFamily: "'Source Serif 4', 'Noto Serif', 'Songti SC', Georgia, serif",
    description: 'Chuẩn mực đọc truyện dài, giữ dấu tiếng Việt rõ (Mặc định)',
  },
  {
    id: 'lora',
    label: 'Lora',
    cssFamily: "'Lora', 'Noto Serif', 'Songti SC', Georgia, serif",
    description: 'Nhịp chữ uyển chuyển, êm mắt cho tiểu thuyết tâm lý / ngôn tình',
  },
  {
    id: 'noto-serif',
    label: 'Noto Serif (Đa ngữ Việt-Trung)',
    cssFamily: "'Noto Serif', 'Songti SC', 'SimSun', Georgia, serif",
    description: 'Đồng đều giữa chữ Hán, chữ Việt và Latin trong bản song ngữ',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    cssFamily: "'Merriweather', 'Noto Serif', Georgia, serif",
    description: 'Nét đậm vừa, đọc rất rõ trên màn hình độ phân giải cao',
  },
  {
    id: 'be-vietnam-prose',
    label: 'Be Vietnam Pro (Sans đọc nhanh)',
    cssFamily: "'Be Vietnam Pro', system-ui, sans-serif",
    description: 'Dành cho người thích đọc bản dịch thuần sans-serif thoáng mắt',
  },
];

export const MONO_FONT_OPTIONS: FontChoice[] = [
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    cssFamily: "'JetBrains Mono', ui-monospace, monospace",
    description: 'Sắc nét, số liệu thẳng hàng chuẩn (Mặc định)',
  },
  {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    cssFamily: "'IBM Plex Mono', ui-monospace, monospace",
    description: 'Phân biệt rõ dấu câu, thẻ SRT/VTT và JSON kỹ thuật',
  },
];

export const DEFAULT_TYPOGRAPHY_CONFIG: TypographyConfig = {
  presetId: 'editorial',
  sansFont: 'plus-jakarta',
  displayFont: 'fraunces',
  literaryFont: 'source-serif',
  monoFont: 'jetbrains-mono',
  uiFontSizePx: 16,
  literaryFontSizePx: 17,
  literaryLineHeight: 1.75,
};

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  {
    id: 'editorial',
    name: 'Biên tập Văn học',
    subtitle: 'Fraunces · Source Serif 4 · Plus Jakarta',
    config: {
      sansFont: 'plus-jakarta',
      displayFont: 'fraunces',
      literaryFont: 'source-serif',
      monoFont: 'jetbrains-mono',
      uiFontSizePx: 16,
      literaryFontSizePx: 17,
      literaryLineHeight: 1.75,
    },
  },
  {
    id: 'classic_novel',
    name: 'Tiểu thuyết Cổ điển',
    subtitle: 'Playfair Display · Lora · Be Vietnam Pro',
    config: {
      sansFont: 'be-vietnam',
      displayFont: 'playfair',
      literaryFont: 'lora',
      monoFont: 'ibm-plex-mono',
      uiFontSizePx: 16,
      literaryFontSizePx: 18,
      literaryLineHeight: 1.85,
    },
  },
  {
    id: 'wuxia_ink',
    name: 'Cổ phong & Đa ngữ',
    subtitle: 'Cormorant · Noto Serif · Be Vietnam Pro',
    config: {
      sansFont: 'be-vietnam',
      displayFont: 'cormorant',
      literaryFont: 'noto-serif',
      monoFont: 'jetbrains-mono',
      uiFontSizePx: 16,
      literaryFontSizePx: 18,
      literaryLineHeight: 1.8,
    },
  },
  {
    id: 'modern_studio',
    name: 'Studio Hiện đại',
    subtitle: 'Manrope · Be Vietnam Pro · IBM Plex Mono',
    config: {
      sansFont: 'manrope',
      displayFont: 'manrope-display',
      literaryFont: 'be-vietnam-prose',
      monoFont: 'ibm-plex-mono',
      uiFontSizePx: 15,
      literaryFontSizePx: 16,
      literaryLineHeight: 1.7,
    },
  },
];

const STORAGE_KEY = 'mac_van_typography_v1';

export function getFontChoiceCss(options: FontChoice[], id: string): string {
  return (options.find((o) => o.id === id) || options[0]).cssFamily;
}

export function loadTypographyConfig(): TypographyConfig {
  if (typeof window === 'undefined') return DEFAULT_TYPOGRAPHY_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TYPOGRAPHY_CONFIG;
    const parsed = JSON.parse(raw) as Partial<TypographyConfig>;
    return {
      presetId: typeof parsed.presetId === 'string' ? parsed.presetId : 'custom',
      sansFont: UI_FONT_OPTIONS.some((o) => o.id === parsed.sansFont)
        ? (parsed.sansFont as string)
        : DEFAULT_TYPOGRAPHY_CONFIG.sansFont,
      displayFont: DISPLAY_FONT_OPTIONS.some((o) => o.id === parsed.displayFont)
        ? (parsed.displayFont as string)
        : DEFAULT_TYPOGRAPHY_CONFIG.displayFont,
      literaryFont: LITERARY_FONT_OPTIONS.some((o) => o.id === parsed.literaryFont)
        ? (parsed.literaryFont as string)
        : DEFAULT_TYPOGRAPHY_CONFIG.literaryFont,
      monoFont: MONO_FONT_OPTIONS.some((o) => o.id === parsed.monoFont)
        ? (parsed.monoFont as string)
        : DEFAULT_TYPOGRAPHY_CONFIG.monoFont,
      uiFontSizePx:
        typeof parsed.uiFontSizePx === 'number' &&
        parsed.uiFontSizePx >= 14 &&
        parsed.uiFontSizePx <= 18
          ? parsed.uiFontSizePx
          : DEFAULT_TYPOGRAPHY_CONFIG.uiFontSizePx,
      literaryFontSizePx:
        typeof parsed.literaryFontSizePx === 'number' &&
        parsed.literaryFontSizePx >= 14 &&
        parsed.literaryFontSizePx <= 22
          ? parsed.literaryFontSizePx
          : DEFAULT_TYPOGRAPHY_CONFIG.literaryFontSizePx,
      literaryLineHeight:
        typeof parsed.literaryLineHeight === 'number' &&
        parsed.literaryLineHeight >= 1.5 &&
        parsed.literaryLineHeight <= 2.1
          ? Number(parsed.literaryLineHeight.toFixed(2))
          : DEFAULT_TYPOGRAPHY_CONFIG.literaryLineHeight,
    };
  } catch {
    return DEFAULT_TYPOGRAPHY_CONFIG;
  }
}

export function saveTypographyConfig(config: TypographyConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export function applyTypographyConfig(config: TypographyConfig): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--font-sans', getFontChoiceCss(UI_FONT_OPTIONS, config.sansFont));
  root.style.setProperty('--font-display', getFontChoiceCss(DISPLAY_FONT_OPTIONS, config.displayFont));
  root.style.setProperty('--font-serif', getFontChoiceCss(LITERARY_FONT_OPTIONS, config.literaryFont));
  root.style.setProperty('--font-mono', getFontChoiceCss(MONO_FONT_OPTIONS, config.monoFont));
  root.style.setProperty('--ui-font-size', `${config.uiFontSizePx}px`);
  root.style.setProperty('--literary-size', `${config.literaryFontSizePx}px`);
  root.style.setProperty('--literary-leading', String(config.literaryLineHeight));
}
