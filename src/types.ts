import type { Timestamp } from 'firebase/firestore';

export type ThemeMode = 'light' | 'dark';
export type ChapterStatus = 'draft' | 'translating' | 'translated' | 'reviewed';
export type GlossaryCategory = 'character' | 'location' | 'skill' | 'other';
export type AppSection = 'library' | 'studio' | 'multimodal' | 'glossary' | 'settings';
export type StudioViewMode = 'bilingual' | 'reader';

export interface UserSettings {
  ownerId: string;
  apiBaseUrl: string;
  apiModel: string;
  theme: ThemeMode;
  updatedAt?: Timestamp;
}

export interface Novel {
  id: string;
  ownerId: string;
  title: string;
  author: string;
  sourceLang: string;
  targetLang: string;
  styleInstruction: string;
  chapterCount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Chapter {
  id: string;
  ownerId: string;
  novelId: string;
  order: number;
  titleSource: string;
  titleTranslated: string;
  status: ChapterStatus;
  segmentCount: number;
  translatedCount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Segment {
  id: string;
  ownerId: string;
  novelId: string;
  chapterId: string;
  index: number;
  sourceText: string;
  translatedText: string;
  note: string;
  isReviewed: boolean;
  updatedAt?: Timestamp;
}

export interface GlossaryTerm {
  id: string;
  ownerId: string;
  novelId: string;
  sourceTerm: string;
  targetTerm: string;
  category: GlossaryCategory;
  enabled: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TranslationQueueState {
  isRunning: boolean;
  activeSegmentId: string | null;
  streamingText: string;
  completedInRun: number;
  totalInRun: number;
  error: string | null;
}

export const FIELD_LIMITS = {
  NOVEL_TITLE_MAX: 200,
  NOVEL_AUTHOR_MAX: 150,
  STYLE_INSTRUCTION_MAX: 1000,
  CHAPTER_TITLE_MAX: 300,
  SEGMENT_SOURCE_MAX: 10000,
  SEGMENT_TRANSLATED_MAX: 20000,
  SEGMENT_NOTE_MAX: 1000,
  GLOSSARY_TERM_MAX: 200,
  API_URL_MAX: 300,
  API_MODEL_MAX: 100,
} as const;
