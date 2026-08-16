'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { DecisionSheet } from './decision-sheet';

/** Ba tỉ lệ cột, khai thành preset (DESIGN_SYSTEM §6.4). */
export type ColumnPreset = 'balanced' | 'wide-middle' | 'two-column';

const GRID: Record<ColumnPreset, string> = {
  balanced: 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.05fr)]',
  'wide-middle': 'xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.7fr)_minmax(0,1fr)]',
  'two-column': 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]',
};

/**
 * Ba tầng bố cục trên breakpoint **mặc định** của Tailwind (DESIGN_SYSTEM §6.1):
 *
 * | dưới `md` (mobile) | `md`→`xl` (tablet) | `xl`+ (desktop) |
 * | một cột + bottom sheet | hai cột, quyết định dính bên phải | ba cột đầy đủ |
 *
 * Ba vai sống sót ở mọi bề rộng bằng **ba cơ chế khác nhau**, không phải bằng cách xếp chồng
 * cả ba (§6.3): ngữ cảnh → accordion · nội dung → toàn bề rộng · quyết định → `DecisionSheet`
 * neo đáy. Xếp thẳng ba cột thành ba khối dọc sẽ đẩy cột quyết định xuống đáy trang và phá
 * NFR-G-3, không chỉ là xấu.
 */
export function WizardShell({
  preset = 'balanced',
  contextTitle = 'Ngữ cảnh',
  contextDefaultOpen = false,
  context,
  content,
  decide,
  decideSummary,
  decideCount = 0,
  summaryBar,
  bottomBar,
}: {
  preset?: ColumnPreset;
  contextTitle?: string;
  contextDefaultOpen?: boolean;
  context: ReactNode;
  content: ReactNode;
  decide?: ReactNode;
  decideSummary?: string;
  decideCount?: number;
  summaryBar?: ReactNode;
  /** Thay `DecisionSheet` ở B5 — `ExportBar` thành thanh dính đáy (§6.4). */
  bottomBar?: ReactNode;
}) {
  const hasDecide = Boolean(decide);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-3 md:px-4 md:py-4">
      <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4', GRID[preset])}>
        {/* ── Vai 1 · ngữ cảnh ─────────────────────────────────────────────
            Mobile: accordion, mặc định đóng khi bước đó đã có dữ liệu — là thứ đã xong,
            chỉ tra lại khi cần. Tablet/desktop: cột thật. */}
        <div className="md:hidden">
          <Accordion
            type="single"
            collapsible
            defaultValue={contextDefaultOpen ? 'ctx' : undefined}
          >
            <AccordionItem
              value="ctx"
              className="border-hairline bg-surface rounded-xl border px-3"
            >
              <AccordionTrigger className="py-3 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <ChevronDown className="hidden" aria-hidden />
                  {contextTitle}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">{context}</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <div className="hidden min-w-0 space-y-3 md:block">{context}</div>

        {/* ── Vai 2 · nội dung · chiếm toàn bộ bề rộng ở mobile ───────────── */}
        <div
          className={cn(
            'min-w-0 space-y-3',
            preset === 'two-column' ? 'md:col-span-1' : 'md:col-span-1',
          )}
        >
          {content}
        </div>

        {/* ── Vai 3 · quyết định ───────────────────────────────────────────
            Tablet/desktop: cột dính khi cuộn. Mobile: chuyển hẳn xuống DecisionSheet. */}
        {hasDecide && (
          <div className="hidden min-w-0 space-y-3 md:sticky md:top-32 md:col-span-1 md:block md:self-start">
            {decide}
          </div>
        )}
      </div>

      {summaryBar && <div className="mt-3 md:mt-4">{summaryBar}</div>}

      {/* Trang nội dung chừa lề dưới đủ để dòng cuối không bị nấc "hé" che (§6.3). */}
      <div className={cn('md:hidden', hasDecide || bottomBar ? 'h-28' : 'h-2')} aria-hidden />

      {hasDecide && (
        <DecisionSheet summary={decideSummary} count={decideCount}>
          {decide}
        </DecisionSheet>
      )}
      {bottomBar}
    </div>
  );
}
