import {
  BookA,
  BookOpen,
  Image as ImageIcon,
  Library,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AppSection, Novel, ThemeMode } from '../types';

interface ToolSidebarProps {
  user: User;
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  novels: Novel[];
  activeNovel: Novel | null;
  onSelectNovelId: (novelId: string) => void;
  chaptersCount: number;
  glossaryCount: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSignOut: () => void;
}

const TOOL_ITEMS: Array<{
  id: AppSection;
  label: string;
  icon: typeof Library;
}> = [
  { id: 'library', label: 'Thư viện', icon: Library },
  { id: 'studio', label: 'Biên tập', icon: BookOpen },
  { id: 'multimodal', label: 'Dịch ảnh & Mẫu', icon: ImageIcon },
  { id: 'glossary', label: 'Thuật ngữ', icon: BookA },
  { id: 'settings', label: 'Cài đặt', icon: Settings },
];

export function ToolSidebar({
  user,
  activeSection,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  novels,
  activeNovel,
  onSelectNovelId,
  chaptersCount,
  glossaryCount,
  theme,
  onToggleTheme,
  onSignOut,
}: ToolSidebarProps) {
  const getItemCount = (id: AppSection): number | null => {
    if (id === 'library') return novels.length;
    if (id === 'studio' && activeNovel) return chaptersCount;
    if (id === 'glossary' && activeNovel) return glossaryCount;
    return null;
  };

  const renderSidebarInner = (isMobile: boolean) => {
    const isExpanded = isMobile || !collapsed;

    return (
      <div className="flex flex-col h-full bg-[#F3EFE6]/70 dark:bg-[#181512] text-[#1F1C18] dark:text-[#EDE8DF]">
        {/* Brand + Collapse Header */}
        <div
          className={`h-14 shrink-0 border-b border-[#E4DDD0] dark:border-[#2E2924] flex items-center ${
            isExpanded ? 'justify-between px-4' : 'justify-center px-2'
          }`}
        >
          {isExpanded && (
            <button
              type="button"
              onClick={() => {
                onNavigate('library');
                if (isMobile) onCloseMobile();
              }}
              className="font-display text-lg font-semibold tracking-tight text-[#1F1C18] dark:text-[#EDE8DF] whitespace-nowrap cursor-pointer"
            >
              Mặc Vận
            </button>
          )}

          {isMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Đóng menu công cụ"
              className="p-2 rounded-lg text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? 'Mở rộng menu công cụ' : 'Thu gọn menu công cụ'}
              aria-label={collapsed ? 'Mở rộng menu công cụ' : 'Thu gọn menu công cụ'}
              className="p-2 rounded-lg text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#EAE3D5]/70 dark:hover:bg-[#221E1A] transition-colors cursor-pointer"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Active Novel Switcher */}
        {isExpanded && (
          <div className="px-3.5 py-3.5 border-b border-[#E4DDD0] dark:border-[#2E2924] space-y-1.5">
            <label
              htmlFor={isMobile ? 'mobile-novel-switch' : 'desktop-novel-switch'}
              className="block text-[11px] font-medium text-[#6B6257] dark:text-[#A89F91]"
            >
              Bộ truyện đang làm việc
            </label>
            {novels.length > 0 ? (
              <select
                id={isMobile ? 'mobile-novel-switch' : 'desktop-novel-switch'}
                value={activeNovel?.id || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    onSelectNovelId(e.target.value);
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309] truncate"
              >
                {!activeNovel && <option value="">Chọn tiểu thuyết...</option>}
                {novels.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">
                Chưa có tiểu thuyết nào
              </p>
            )}
            {activeNovel && (
              <p className="text-[11px] text-[#6B6257] dark:text-[#A89F91] font-mono-tabular truncate">
                {activeNovel.sourceLang.toUpperCase()} → {activeNovel.targetLang.toUpperCase()} ·{' '}
                {chaptersCount} chương · {glossaryCount} từ
              </p>
            )}
          </div>
        )}

        {/* Tool Navigation */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1" aria-label="Menu công cụ">
          {isExpanded && (
            <p className="px-2.5 pb-1 text-[11px] font-medium text-[#6B6257] dark:text-[#A89F91]">
              Menu công cụ
            </p>
          )}
          {TOOL_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const count = getItemCount(item.id);

            return (
              <button
                key={item.id}
                type="button"
                title={!isExpanded ? item.label : undefined}
                onClick={() => {
                  onNavigate(item.id);
                  if (isMobile) onCloseMobile();
                }}
                className={`w-full flex items-center ${
                  isExpanded ? 'justify-between px-3 py-2.5' : 'justify-center px-2 py-2.5'
                } rounded-lg text-sm transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B45309] ${
                  isActive
                    ? 'bg-[#EAE3D5] dark:bg-[#26211C] text-[#B45309] dark:text-[#D97706] font-semibold'
                    : 'text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#EAE3D5]/55 dark:hover:bg-[#1F1B17]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  {isExpanded && <span className="truncate">{item.label}</span>}
                </span>
                {isExpanded && count !== null && (
                  <span className="text-xs font-mono-tabular text-[#6B6257] dark:text-[#A89F91] shrink-0">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Theme + Account Actions */}
        <div className="shrink-0 p-2.5 border-t border-[#E4DDD0] dark:border-[#2E2924] space-y-1">
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Chuyển sang giấy sáng' : 'Chuyển sang mực đêm'}
            className={`w-full flex items-center ${
              isExpanded ? 'gap-3 px-3 py-2' : 'justify-center px-2 py-2'
            } rounded-lg text-xs font-medium text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#EAE3D5]/55 dark:hover:bg-[#1F1B17] transition-colors cursor-pointer whitespace-nowrap`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 shrink-0" />
            )}
            {isExpanded && (
              <span>{theme === 'dark' ? 'Chế độ giấy sáng' : 'Chế độ mực đêm'}</span>
            )}
          </button>

          <button
            type="button"
            onClick={onSignOut}
            title={`Đăng xuất (${user.displayName || user.email || 'Tài khoản'})`}
            className={`w-full flex items-center ${
              isExpanded ? 'justify-between gap-2 px-3 py-2' : 'justify-center px-2 py-2'
            } rounded-lg text-xs text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#EAE3D5]/55 dark:hover:bg-[#1F1B17] transition-colors cursor-pointer`}
          >
            {isExpanded ? (
              <>
                <span className="truncate font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                  {user.displayName || user.email || 'Tài khoản'}
                </span>
                <LogOut className="w-3.5 h-3.5 shrink-0" />
              </>
            ) : (
              <LogOut className="w-4 h-4 shrink-0" />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Left Tool Menu */}
      <aside
        className={`hidden md:block shrink-0 border-r border-[#E4DDD0] dark:border-[#2E2924] sticky top-0 h-screen transition-[width] duration-150 ${
          collapsed ? 'w-[68px]' : 'w-60'
        }`}
      >
        {renderSidebarInner(false)}
      </aside>

      {/* Mobile Drawer Tool Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full border-r border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#141210]">
            {renderSidebarInner(true)}
          </aside>
        </div>
      )}
    </>
  );
}
