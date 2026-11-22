export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
}

export const SOURCE_LANGUAGES: LanguageOption[] = [
  { code: 'zh', label: 'Tiếng Trung (Giản thể)', nativeLabel: '简体中文' },
  { code: 'zh-TW', label: 'Tiếng Trung (Phồn thể)', nativeLabel: '繁體中文' },
  { code: 'en', label: 'Tiếng Anh', nativeLabel: 'English' },
  { code: 'ja', label: 'Tiếng Nhật', nativeLabel: '日本語' },
  { code: 'ko', label: 'Tiếng Hàn', nativeLabel: '한국어' },
  { code: 'fr', label: 'Tiếng Pháp', nativeLabel: 'Français' },
  { code: 'de', label: 'Tiếng Đức', nativeLabel: 'Deutsch' },
  { code: 'es', label: 'Tiếng Tây Ban Nha', nativeLabel: 'Español' },
  { code: 'ru', label: 'Tiếng Nga', nativeLabel: 'Русский' },
  { code: 'auto', label: 'Tự động nhận diện', nativeLabel: 'Auto' },
];

export const TARGET_LANGUAGES: LanguageOption[] = [
  { code: 'vi', label: 'Tiếng Việt', nativeLabel: 'Tiếng Việt' },
  { code: 'en', label: 'Tiếng Anh', nativeLabel: 'English' },
  { code: 'zh', label: 'Tiếng Trung (Giản thể)', nativeLabel: '简体中文' },
  { code: 'zh-TW', label: 'Tiếng Trung (Phồn thể)', nativeLabel: '繁體中文' },
  { code: 'ja', label: 'Tiếng Nhật', nativeLabel: '日本語' },
  { code: 'ko', label: 'Tiếng Hàn', nativeLabel: '한국어' },
  { code: 'fr', label: 'Tiếng Pháp', nativeLabel: 'Français' },
  { code: 'th', label: 'Tiếng Thái', nativeLabel: 'ไทย' },
  { code: 'id', label: 'Tiếng Indonesia', nativeLabel: 'Bahasa Indonesia' },
];

export interface ModelPreset {
  id: string;
  label: string;
  scale: string;
  contextInfo: string;
  description: string;
  capabilities: string[];
}

export const INDEX_TRANSLATE_MODELS: ModelPreset[] = [
  {
    id: 'Index-Translate-9B',
    label: 'Index-Translate-9B',
    scale: '9B Dense · Qwen3.5',
    contextInfo: '8GB+ VRAM · Cân bằng tối ưu',
    description: 'Cân bằng tốc độ & chất lượng văn học, hỗ trợ dịch ảnh không cần OCR và thuật ngữ.',
    capabilities: ['150+ ngôn ngữ', 'Dịch ảnh Zero-OCR', 'Thuật ngữ & Định dạng'],
  },
  {
    id: 'Index-Translate-35B-A3B',
    label: 'Index-Translate-35B-A3B',
    scale: '35B MoE (3B Active)',
    contextInfo: '262K Context · Flagship',
    description: 'Mô hình MoE cỡ lớn cho ngữ cảnh chương rất dài, thành ngữ và ràng buộc phức tạp.',
    capabilities: ['150+ ngôn ngữ', 'Ngữ cảnh siêu dài', 'Dịch ảnh Zero-OCR'],
  },
  {
    id: 'Index-Translate-2B',
    label: 'Index-Translate-2B',
    scale: '2B Dense · Edge',
    contextInfo: '~1.5GB Q4 · Siêu nhẹ',
    description: 'Phiên bản siêu nhẹ tối ưu tốc độ phản hồi nhanh và chạy trên thiết bị cấu hình thấp.',
    capabilities: ['150+ ngôn ngữ', 'Phản hồi nhanh', 'Dịch ảnh Zero-OCR'],
  },
];

export interface GenrePreset {
  id: string;
  label: string;
  defaultInstruction: string;
}

export const TRANSLATION_GENRES: GenrePreset[] = [
  {
    id: '小说',
    label: 'Tiểu thuyết / Văn xuôi',
    defaultInstruction: '',
  },
  {
    id: '对话',
    label: 'Hội thoại / Truyện tranh',
    defaultInstruction: 'Dịch lời thoại ngắn gọn, tự nhiên đúng ngữ khí nhân vật.',
  },
  {
    id: '字幕',
    label: 'Phụ đề SRT / Kịch bản',
    defaultInstruction: '严格保留SRT时间轴和序号格式，仅翻译字幕文本内容。',
  },
  {
    id: 'VTT/ASS',
    label: 'Phụ đề WebVTT / ASS',
    defaultInstruction: '严格保留WEBVTT头部、时间轴、样式标签（如{\\i1}）与Dialogue前缀，仅翻译台词文本。',
  },
  {
    id: 'Markdown',
    label: 'Tài liệu Markdown',
    defaultInstruction: '严格保留所有Markdown标题、列表、代码块与链接语法，仅翻译自然语言文本。',
  },
  {
    id: 'JSON',
    label: 'Dữ liệu JSON / UI',
    defaultInstruction: '严格保留合法JSON语法格式和所有key键名，仅翻译value文本。',
  },
  {
    id: 'CSV/TSV',
    label: 'Bảng CSV / TSV',
    defaultInstruction: '严格保留CSV/TSV分隔符（逗号或制表符）、引号转义与列结构，仅翻译单元格文本。',
  },
  {
    id: 'HTML',
    label: 'Mã HTML / Web',
    defaultInstruction: '严格保留所有HTML标签、属性、class与URL，仅翻译标签内的可见文本内容。',
  },
  {
    id: '文本',
    label: 'Văn bản tổng quát',
    defaultInstruction: '',
  },
];

export const DEFAULT_API_BASE_URL = 'https://index-translate.bilibili.com/v1';
export const DEFAULT_MODEL = 'Index-Translate-9B';

export function getLanguageLabel(code: string): string {
  const found = [...SOURCE_LANGUAGES, ...TARGET_LANGUAGES].find((l) => l.code === code);
  return found ? found.label : code;
}
