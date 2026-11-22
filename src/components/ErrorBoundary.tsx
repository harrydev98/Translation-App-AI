import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'Đã xảy ra lỗi không mong muốn.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.error) {
        readable = `Lỗi đồng bộ dữ liệu (${parsed.operationType || 'read'}): ${parsed.error}`;
      }
    } catch {
      // Keep original message
    }
    return { hasError: true, message: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] p-6">
          <div className="max-w-lg w-full border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6] dark:bg-[#1C1917] rounded-xl p-8">
            <div className="flex items-center gap-3 text-[#B45309] dark:text-[#D97706] mb-4">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="font-display text-xl font-semibold">Không thể hoàn tất thao tác</h2>
            </div>
            <p className="text-sm text-[#6B6257] dark:text-[#A89F91] leading-relaxed mb-6 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
