import { LogOut, Moon, Sun } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AppSection, ThemeMode } from '../types';

interface HeaderProps {
  user: User | null;
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{ id: AppSection; label: string }> = [
  { id: 'library', label: 'Thư viện' },
  { id: 'studio', label: 'Biên tập' },
  { id: 'multimodal', label: 'Dịch ảnh & Mẫu' },
  { id: 'glossary', label: 'Thuật ngữ' },
  { id: 'settings', label: 'Cài đặt' },
];

export function Header({
  user,
  activeSection,
  onNavigate,
  theme,
  onToggleTheme,
  onSignIn,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2]/95 dark:bg-[#141210]/95 backdrop-blur-sm">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('library')}
          className="font-display text-xl font-semibold tracking-tight text-[#1F1C18] dark:text-[#EDE8DF] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B45309] rounded"
        >
          Mặc Vận
        </button>

        {/* Zone 2: Concise single-line text navigation links */}
        {user ? (
          <nav className="flex items-center gap-6 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative py-1 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B45309] rounded ${
                    isActive
                      ? 'text-[#B45309] dark:text-[#D97706]'
                      : 'text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF]'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 right-0 -bottom-[17px] h-[2px] bg-[#B45309] dark:bg-[#D97706]"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="hidden md:block" />
        )}

        {/* Zone 3: Theme switcher + Primary user action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Chuyển sang chế độ giấy sáng' : 'Chuyển sang chế độ mực đêm'}
            title={theme === 'dark' ? 'Chế độ giấy sáng' : 'Chế độ mực đêm'}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors duration-150 cursor-pointer shrink-0"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              title={`Đăng xuất (${user.email || user.displayName || 'Tài khoản'})`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="max-w-[140px] truncate hidden sm:inline">
                {user.displayName || user.email || 'Tài khoản'}
              </span>
              <LogOut className="w-3.5 h-3.5 text-[#6B6257] dark:text-[#A89F91]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Đăng nhập Google
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
