import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Chapter, Novel, Segment } from '../types';
import type { ChapterAuditReport, ReviewRulesConfig } from '../utils/translationReviewer';

interface ReviewPanelProps {
  novel: Novel;
  chapter: Chapter;
  segments: Segment[];
  report: ChapterAuditReport;
  rules: ReviewRulesConfig;
  isQueueRunning: boolean;
  onUpdateRules: (next: ReviewRulesConfig) => void;
  onJumpToSegment: (segmentId: string) => void;
  onRetranslateSegment: (segment: Segment) => Promise<void>;
  onFixAllErrors: (segmentIds: string[]) => Promise<void>;
  onMarkAllReviewed: () => Promise<void>;
  onFinalizeChapter: () => Promise<void>;
  onClose: () => void;
}

export function ReviewPanel({
  novel,
  chapter,
  segments,
  report,
  rules,
  isQueueRunning,
  onUpdateRules,
  onJumpToSegment,
  onRetranslateSegment,
  onFixAllErrors,
  onMarkAllReviewed,
  onFinalizeChapter,
  onClose,
}: ReviewPanelProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [forbiddenInput, setForbiddenInput] = useState(rules.forbiddenTerms.join(', '));
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning'>('all');
  const [finalizing, setFinalizing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const visibleIssues = report.issues.filter((item) =>
    filterSeverity === 'all' ? true : item.severity === filterSeverity
  );

  const segmentMap = new Map(segments.map((s) => [s.id, s]));

  const handleApplyForbiddenTerms = () => {
    const list = forbiddenInput
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    onUpdateRules({ ...rules, forbiddenTerms: Array.from(new Set(list)) });
  };

  const handleFinalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    try {
      await onFinalizeChapter();
    } finally {
      setFinalizing(false);
    }
  };

  const handleMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await onMarkAllReviewed();
    } finally {
      setMarkingAll(false);
    }
  };

  const isAlreadyFinalized = chapter.status === 'reviewed';
  const isCleanPass = report.errorCount === 0 && report.warningCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs">
      <div className="w-full max-w-2xl h-full bg-[#FAF7F2] dark:bg-[#141210] border-l border-[#E4DDD0] dark:border-[#2E2924] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E4DDD0] dark:border-[#2E2924] flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#B45309] dark:text-[#D97706] mb-1">
              Kiểm duyệt trước khi hoàn thành · {novel.title}
            </p>
            <h2 className="font-display text-2xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
              {chapter.titleTranslated || chapter.titleSource}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Metrics Row */}
        <div className="px-6 py-4 border-b border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/55 dark:bg-[#1C1917]/70 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">Đoạn đạt chuẩn</p>
            <p className="font-mono-tabular text-lg font-semibold text-[#1F1C18] dark:text-[#EDE8DF] mt-0.5">
              {report.passedSegments}/{report.totalSegments}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">Lỗi bắt buộc</p>
            <p
              className={`font-mono-tabular text-lg font-semibold mt-0.5 ${
                report.errorCount > 0
                  ? 'text-[#DC2626] dark:text-[#F87171]'
                  : 'text-[#15803D] dark:text-[#4ADE80]'
              }`}
            >
              {report.errorCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">Cảnh báo quy định</p>
            <p
              className={`font-mono-tabular text-lg font-semibold mt-0.5 ${
                report.warningCount > 0
                  ? 'text-[#B45309] dark:text-[#D97706]'
                  : 'text-[#1F1C18] dark:text-[#EDE8DF]'
              }`}
            >
              {report.warningCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">Đã bấm duyệt</p>
            <p className="font-mono-tabular text-lg font-semibold text-[#1F1C18] dark:text-[#EDE8DF] mt-0.5">
              {report.reviewedSegments}/{report.totalSegments}
            </p>
          </div>
        </div>

        {/* Action Bar + Filter + Rules Toggle */}
        <div className="px-6 py-3 border-b border-[#E4DDD0] dark:border-[#2E2924] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#1C1917] border border-[#E4DDD0] dark:border-[#2E2924]">
            <button
              type="button"
              onClick={() => setFilterSeverity('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                filterSeverity === 'all'
                  ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                  : 'text-[#6B6257] dark:text-[#A89F91]'
              }`}
            >
              Tất cả ({report.issues.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterSeverity('error')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                filterSeverity === 'error'
                  ? 'bg-white dark:bg-[#2A2520] text-[#DC2626] dark:text-[#F87171]'
                  : 'text-[#6B6257] dark:text-[#A89F91]'
              }`}
            >
              Lỗi ({report.errorCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterSeverity('warning')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                filterSeverity === 'warning'
                  ? 'bg-white dark:bg-[#2A2520] text-[#B45309] dark:text-[#D97706]'
                  : 'text-[#6B6257] dark:text-[#A89F91]'
              }`}
            >
              Cảnh báo ({report.warningCount})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {report.fixableSegmentIds.length > 0 && (
              <button
                type="button"
                disabled={isQueueRunning}
                onClick={() => onFixAllErrors(report.fixableSegmentIds)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#B45309] dark:border-[#D97706] text-[#B45309] dark:text-[#D97706] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isQueueRunning ? 'animate-spin' : ''}`} />
                Dịch lại {report.fixableSegmentIds.length} đoạn lỗi
              </button>
            )}

            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Quy định kiểm tra
            </button>
          </div>
        </div>

        {/* Rules Configuration Drawer */}
        {rulesOpen && (
          <div className="px-6 py-4 border-b border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/45 dark:bg-[#181512] space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rules.checkGlossary}
                  onChange={(e) => onUpdateRules({ ...rules, checkGlossary: e.target.checked })}
                  className="accent-[#B45309]"
                />
                <span>Kiểm tra khớp 100% từ điển thuật ngữ</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rules.checkSourceLeak}
                  onChange={(e) => onUpdateRules({ ...rules, checkSourceLeak: e.target.checked })}
                  className="accent-[#B45309]"
                />
                <span>Phát hiện chữ nguyên tác chưa dịch</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rules.checkQuotes}
                  onChange={(e) => onUpdateRules({ ...rules, checkQuotes: e.target.checked })}
                  className="accent-[#B45309]"
                />
                <span>Kiểm tra cân đối ngoặc kép đối thoại</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rules.checkLength}
                  onChange={(e) => onUpdateRules({ ...rules, checkLength: e.target.checked })}
                  className="accent-[#B45309]"
                />
                <span>Cảnh báo đoạn dịch quá ngắn / quá dài</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={rules.requireAllReviewed}
                  onChange={(e) =>
                    onUpdateRules({ ...rules, requireAllReviewed: e.target.checked })
                  }
                  className="accent-[#B45309]"
                />
                <span>Bắt buộc đánh dấu “Duyệt” tất cả các đoạn trước khi chốt</span>
              </label>
            </div>

            <div className="pt-2 border-t border-[#E4DDD0] dark:border-[#2E2924]">
              <label className="block text-[#6B6257] dark:text-[#A89F91] mb-1">
                Danh sách từ / cụm từ cấm theo quy định (ngăn cách bằng dấu phẩy):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={forbiddenInput}
                  onChange={(e) => setForbiddenInput(e.target.value)}
                  onBlur={handleApplyForbiddenTerms}
                  placeholder="VD: hệ thống thông báo, Convert, ta là..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                />
                <button
                  type="button"
                  onClick={handleApplyForbiddenTerms}
                  className="px-3 py-1.5 font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] cursor-pointer"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Issues List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {visibleIssues.length === 0 ? (
            <div className="py-16 text-center max-w-md mx-auto">
              <CheckCircle2 className="w-10 h-10 mx-auto text-[#15803D] dark:text-[#4ADE80] mb-3" />
              <h3 className="font-display text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF] mb-2">
                {isCleanPass
                  ? 'Bản dịch đạt toàn bộ quy định & thuật ngữ'
                  : 'Không có mục nào trong bộ lọc này'}
              </h3>
              <p className="text-sm text-[#6B6257] dark:text-[#A89F91] leading-relaxed">
                {isCleanPass
                  ? 'Mọi đoạn văn đã được dịch đầy đủ, không sót chữ gốc, khớp toàn bộ từ điển thuật ngữ và đúng định dạng. Bạn có thể chốt hoàn thành chương và xuất bản.'
                  : 'Thử chuyển sang tab "Tất cả" để xem đầy đủ danh sách kiểm tra.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E4DDD0] dark:divide-[#2E2924]">
              {visibleIssues.map((issue) => {
                const seg = issue.segmentId ? segmentMap.get(issue.segmentId) : undefined;
                return (
                  <div key={issue.id} className="py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {issue.severity === 'error' ? (
                          <AlertCircle className="w-4 h-4 text-[#DC2626] dark:text-[#F87171] shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[#B45309] dark:text-[#D97706] shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs mb-0.5">
                            <span
                              className={`font-semibold ${
                                issue.severity === 'error'
                                  ? 'text-[#DC2626] dark:text-[#F87171]'
                                  : 'text-[#B45309] dark:text-[#D97706]'
                              }`}
                            >
                              {issue.severity === 'error' ? 'Lỗi bắt buộc' : 'Cảnh báo'}
                            </span>
                            <span aria-hidden="true" className="text-[#C7BCAE]">
                              ·
                            </span>
                            <span className="font-mono-tabular text-[#6B6257] dark:text-[#A89F91]">
                              {issue.segmentIndex !== null
                                ? `Đoạn #${String(issue.segmentIndex + 1).padStart(2, '0')}`
                                : 'Tiêu đề chương'}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                            {issue.title}
                          </p>
                          <p className="text-xs text-[#6B6257] dark:text-[#A89F91] mt-1 leading-relaxed">
                            {issue.detail}
                          </p>
                          {issue.suggestion && (
                            <p className="text-xs text-[#1F1C18]/80 dark:text-[#EDE8DF]/80 mt-1">
                              Gợi ý: {issue.suggestion}
                            </p>
                          )}
                        </div>
                      </div>

                      {seg && (
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onJumpToSegment(seg.id);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer whitespace-nowrap"
                          >
                            Tới đoạn
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>

                          {(issue.code === 'glossary_mismatch' ||
                            issue.code === 'leftover_source_script' ||
                            issue.code === 'empty_translation' ||
                            issue.code === 'prompt_leak') && (
                            <button
                              type="button"
                              disabled={isQueueRunning}
                              onClick={() => onRetranslateSegment(seg)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] text-white cursor-pointer disabled:opacity-40 whitespace-nowrap"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Dịch lại
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/60 dark:bg-[#1C1917] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#6B6257] dark:text-[#A89F91]">
            {isAlreadyFinalized ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#15803D] dark:text-[#4ADE80]">
                <ShieldCheck className="w-4 h-4" />
                Chương đã được chốt hoàn thành
              </span>
            ) : report.errorCount > 0 ? (
              <span>Vẫn còn {report.errorCount} lỗi bắt buộc cần kiểm tra lại.</span>
            ) : (
              <span>Không còn lỗi bắt buộc. Có thể chốt hoàn thành chương.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {report.reviewedSegments < report.totalSegments && (
              <button
                type="button"
                disabled={markingAll || report.translatedSegments === 0}
                onClick={handleMarkAll}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#FAF7F2] dark:hover:bg-[#26221E] cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                {markingAll ? 'Đang duyệt...' : 'Đánh dấu duyệt tất cả'}
              </button>
            )}

            <button
              type="button"
              disabled={finalizing || isQueueRunning || report.translatedSegments === 0}
              onClick={handleFinalize}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#15803D] hover:bg-[#166534] dark:bg-[#16A34A] dark:hover:bg-[#15803D] text-white transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4" />
              {finalizing
                ? 'Đang chốt...'
                : isAlreadyFinalized
                  ? 'Cập nhật trạng thái Đã duyệt'
                  : 'Xác nhận hoàn thành chương'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
