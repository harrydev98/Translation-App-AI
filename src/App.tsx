import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Menu, Moon, Sun } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlossaryView } from './components/GlossaryView';
import { Header } from './components/Header';
import { LibraryView } from './components/LibraryView';
import { MultimodalView } from './components/MultimodalView';
import { SettingsView } from './components/SettingsView';
import { StudioView } from './components/StudioView';
import { ToolSidebar } from './components/ToolSidebar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useFirestoreData } from './hooks/useFirestoreData';
import type { AppSection, ThemeMode } from './types';

const SECTION_TITLES: Record<AppSection, string> = {
  library: 'Thư viện',
  studio: 'Biên tập',
  multimodal: 'Dịch ảnh & Mẫu',
  glossary: 'Thuật ngữ',
  settings: 'Cài đặt',
};

function MainApp() {
  const {
    user,
    authReady,
    authError,
    handleSignIn,
    handleSignOut,
    settings,
    saveUserSettings,
    novels,
    novelsLoading,
    activeNovelId,
    setActiveNovelId,
    chapters,
    chaptersLoading,
    activeChapterId,
    setActiveChapterId,
    segments,
    segmentsLoading,
    glossary,
    glossaryLoading,
    createNovel,
    updateNovel,
    deleteNovel,
    createChapterWithSegments,
    createMultipleChapters,
    updateChapterMeta,
    deleteChapter,
    updateSegmentTranslation,
    batchUpdateChapterSegments,
    fetchChapterSegments,
    fetchNovelExportData,
    updateSegmentReviewed,
    updateSegmentNote,
    addGlossaryTerm,
    bulkAddGlossaryTerms,
    copyGlossaryFromNovel,
    toggleGlossaryTerm,
    deleteGlossaryTerm,
    createSampleNovel,
  } = useFirestoreData();

  const [activeSection, setActiveSection] = useState<AppSection>('library');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionApiKey, setSessionApiKey] = useState('');
  const [localTheme, setLocalTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('mac_van_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  // Sync theme from cloud user settings when signed in
  useEffect(() => {
    if (user && (settings.theme === 'light' || settings.theme === 'dark')) {
      setLocalTheme(settings.theme);
    }
  }, [user, settings.theme]);

  // Apply .dark class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (localTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('mac_van_theme', localTheme);
  }, [localTheme]);

  const handleToggleTheme = () => {
    const next: ThemeMode = localTheme === 'dark' ? 'light' : 'dark';
    setLocalTheme(next);
    if (user) {
      saveUserSettings({ theme: next });
    }
  };

  const activeNovel = useMemo(
    () => novels.find((n) => n.id === activeNovelId) || null,
    [novels, activeNovelId]
  );

  const handleSelectNovel = (novelId: string) => {
    setActiveNovelId(novelId);
    setActiveSection('studio');
  };

  if (!authReady || !user) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] transition-colors duration-150">
        <Header
          user={user}
          activeSection={activeSection}
          onNavigate={setActiveSection}
          theme={localTheme}
          onToggleTheme={handleToggleTheme}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
        {!authReady ? (
          <div className="max-w-[1440px] mx-auto px-6 py-24 text-center text-sm text-[#6B6257] dark:text-[#A89F91]">
            Đang khởi tạo phiên làm việc...
          </div>
        ) : (
          <WelcomeScreen onSignIn={handleSignIn} authError={authError} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] flex transition-colors duration-150">
      {/* Left: Menu công cụ */}
      <ToolSidebar
        user={user}
        activeSection={activeSection}
        onNavigate={setActiveSection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        novels={novels}
        activeNovel={activeNovel}
        onSelectNovelId={(id) => setActiveNovelId(id)}
        chaptersCount={chapters.length}
        glossaryCount={glossary.length}
        theme={localTheme}
        onToggleTheme={handleToggleTheme}
        onSignOut={handleSignOut}
      />

      {/* Right: Body làm việc */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2]/95 dark:bg-[#141210]/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-6">
          {/* Left: Mobile trigger + Contextual Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu công cụ"
              className="md:hidden p-2 -ml-1 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>

            <nav aria-label="Điều hướng" className="flex items-center gap-2 text-sm min-w-0">
              <button
                type="button"
                onClick={() => setActiveSection('library')}
                className="text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] whitespace-nowrap cursor-pointer hidden sm:inline"
              >
                Mặc Vận
              </button>
              <span aria-hidden="true" className="text-[#6B6257] dark:text-[#A89F91] hidden sm:inline">
                /
              </span>
              <span className="font-medium text-[#1F1C18] dark:text-[#EDE8DF] whitespace-nowrap">
                {SECTION_TITLES[activeSection]}
              </span>
              {activeNovel && activeSection !== 'library' && activeSection !== 'settings' && (
                <>
                  <span aria-hidden="true" className="text-[#6B6257] dark:text-[#A89F91]">
                    /
                  </span>
                  <span className="text-[#B45309] dark:text-[#D97706] truncate max-w-[200px] sm:max-w-[320px] font-medium">
                    {activeNovel.title}
                  </span>
                </>
              )}
            </nav>
          </div>

          {/* Right: Max 2 concise actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {activeSection === 'library' && activeNovel && (
              <button
                type="button"
                onClick={() => setActiveSection('studio')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Mở Biên tập
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={localTheme === 'dark' ? 'Chuyển sang chế độ giấy sáng' : 'Chuyển sang chế độ mực đêm'}
              title={localTheme === 'dark' ? 'Chế độ giấy sáng' : 'Chế độ mực đêm'}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors cursor-pointer shrink-0"
            >
              {localTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <div className="flex-1 min-w-0">
          {activeSection === 'library' ? (
            <LibraryView
              novels={novels}
              loading={novelsLoading}
              activeNovelId={activeNovelId}
              onSelectNovel={handleSelectNovel}
              onCreateNovel={createNovel}
              onUpdateNovel={updateNovel}
              onDeleteNovel={deleteNovel}
              onCreateSampleNovel={async () => {
                await createSampleNovel();
                setActiveSection('studio');
              }}
              onFetchNovelExportData={fetchNovelExportData}
            />
          ) : activeSection === 'studio' ? (
            <StudioView
              novel={activeNovel}
              chapters={chapters}
              chaptersLoading={chaptersLoading}
              activeChapterId={activeChapterId}
              onSelectChapter={setActiveChapterId}
              segments={segments}
              segmentsLoading={segmentsLoading}
              glossary={glossary}
              settings={settings}
              sessionApiKey={sessionApiKey}
              onCreateChapter={async (input) => {
                if (!activeNovel) throw new Error('Chưa chọn truyện.');
                return createChapterWithSegments(activeNovel.id, input);
              }}
              onCreateMultipleChapters={async (items) => {
                if (!activeNovel) return [];
                return createMultipleChapters(activeNovel.id, items);
              }}
              onUpdateChapterMeta={async (chapterId, fields) => {
                if (!activeNovel) return;
                await updateChapterMeta(activeNovel.id, chapterId, fields);
              }}
              onDeleteChapter={async (chapterId) => {
                if (!activeNovel) return;
                await deleteChapter(activeNovel.id, chapterId);
              }}
              onUpdateSegmentTranslation={async (segmentId, translatedText) => {
                if (!activeNovel || !activeChapterId) return;
                await updateSegmentTranslation(
                  activeNovel.id,
                  activeChapterId,
                  segmentId,
                  translatedText
                );
              }}
              onBatchUpdateSegments={async (chapterId, updates, meta) => {
                if (!activeNovel) return;
                await batchUpdateChapterSegments(activeNovel.id, chapterId, updates, meta);
              }}
              onFetchChapterSegments={async (chapterId) => {
                if (!activeNovel) return [];
                return fetchChapterSegments(activeNovel.id, chapterId);
              }}
              onFetchNovelExportData={async () => {
                if (!activeNovel) return [];
                return fetchNovelExportData(activeNovel.id);
              }}
              onUpdateSegmentReviewed={async (segmentId, isReviewed) => {
                if (!activeNovel || !activeChapterId) return;
                await updateSegmentReviewed(activeNovel.id, activeChapterId, segmentId, isReviewed);
              }}
              onUpdateSegmentNote={async (segmentId, note) => {
                if (!activeNovel || !activeChapterId) return;
                await updateSegmentNote(activeNovel.id, activeChapterId, segmentId, note);
              }}
              onAddGlossaryTerm={async (input) => {
                if (!activeNovel) return;
                await addGlossaryTerm(activeNovel.id, input);
              }}
              onGoToLibrary={() => setActiveSection('library')}
            />
          ) : activeSection === 'multimodal' ? (
            <MultimodalView
              activeNovel={activeNovel}
              glossary={glossary}
              settings={settings}
              sessionApiKey={sessionApiKey}
              onSaveAsChapter={
                activeNovel
                  ? async ({ titleSource, paragraphs }) => {
                      await createChapterWithSegments(activeNovel.id, {
                        titleSource,
                        paragraphs,
                        order: chapters.length + 1,
                      });
                    }
                  : undefined
              }
            />
          ) : activeSection === 'glossary' ? (
            <GlossaryView
              novel={activeNovel}
              novels={novels}
              terms={glossary}
              loading={glossaryLoading}
              onAddTerm={async (input) => {
                if (!activeNovel) return;
                await addGlossaryTerm(activeNovel.id, input);
              }}
              onBulkAddTerms={async (entries) => {
                if (!activeNovel) return;
                await bulkAddGlossaryTerms(activeNovel.id, entries);
              }}
              onCopyGlossaryFromNovel={async (sourceNovelId) => {
                if (!activeNovel) return 0;
                return copyGlossaryFromNovel(sourceNovelId, activeNovel.id);
              }}
              onToggleTerm={async (termId, enabled) => {
                if (!activeNovel) return;
                await toggleGlossaryTerm(activeNovel.id, termId, enabled);
              }}
              onDeleteTerm={async (termId) => {
                if (!activeNovel) return;
                await deleteGlossaryTerm(activeNovel.id, termId);
              }}
              onGoToLibrary={() => setActiveSection('library')}
            />
          ) : (
            <SettingsView
              settings={settings}
              sessionApiKey={sessionApiKey}
              onSessionApiKeyChange={setSessionApiKey}
              onSaveSettings={saveUserSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
