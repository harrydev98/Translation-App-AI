import { useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';

interface WelcomeScreenProps {
  onSignIn: () => void;
  authError: string | null;
}

export function WelcomeScreen({ onSignIn, authError }: WelcomeScreenProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <main className="max-w-[1440px] mx-auto px-6 py-12 lg:py-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between py-2">
          <div>
            <p className="text-sm font-medium text-[#B45309] dark:text-[#D97706] mb-4">
              Không gian dịch thuật văn học · Index-Translate-9B
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-[#1F1C18] dark:text-[#EDE8DF] leading-[1.15] text-balance mb-6">
              Chuyển ngữ tiểu thuyết dài kỳ giữ trọn mạch văn và danh xưng
            </h1>
            <p className="font-literary text-lg text-[#6B6257] dark:text-[#A89F91] leading-relaxed max-w-xl mb-8">
              Nhập chương từ tệp TXT hoặc Markdown, áp dụng từ điển thuật ngữ cố định tên nhân vật,
              dịch trực tiếp từng đoạn qua mô hình Index-Translate-9B và hiệu đính song ngữ đồng bộ
              trên đám mây.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-6">
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Đăng nhập Google để bắt đầu
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {authError && (
              <p className="text-sm text-[#DC2626] dark:text-[#F87171] mb-4">{authError}</p>
            )}
          </div>

          <div className="pt-8 mt-8 border-t border-[#E4DDD0] dark:border-[#2E2924] grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="font-mono-tabular text-xs text-[#6B6257] dark:text-[#A89F91] mb-1">
                01. Thuật ngữ
              </p>
              <p className="text-sm font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                Cố định tên riêng và chiêu thức xuyên suốt bộ truyện
              </p>
            </div>
            <div>
              <p className="font-mono-tabular text-xs text-[#6B6257] dark:text-[#A89F91] mb-1">
                02. Song ngữ
              </p>
              <p className="text-sm font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                Dịch streaming từng đoạn, đối chiếu và sửa câu chữ tại chỗ
              </p>
            </div>
            <div>
              <p className="font-mono-tabular text-xs text-[#6B6257] dark:text-[#A89F91] mb-1">
                03. Đồng bộ
              </p>
              <p className="text-sm font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                Lưu trữ đám mây tự động, xuất bản TXT và Markdown sạch
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="h-full min-h-[340px] lg:min-h-[480px] rounded-xl overflow-hidden border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6] dark:bg-[#1C1917]">
            {!imgFailed ? (
              <img
                src="/src/assets/images/editorial_study_desk_1795353148974.jpg"
                alt="Bàn biên tập bản thảo văn học với trang giấy ấm và bút mực"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-10 text-center bg-gradient-to-br from-[#F3EFE6] to-[#E9E1D2] dark:from-[#1C1917] dark:to-[#24201C]">
                <BookOpen className="w-10 h-10 text-[#B45309] dark:text-[#D97706] mb-3" />
                <p className="font-display text-lg font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                  Mặc Vận — Phòng Biên Tập Văn Học
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
