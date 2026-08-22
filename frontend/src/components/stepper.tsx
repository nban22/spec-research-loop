'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { STEPS } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Stepper 5 bước, **dính ngay dưới TopNav ở cả năm bước** — [QĐ] lệch mockup 1–4, theo mockup 5:
 * stepper là điều hướng, phải luôn nhìn thấy được. Trên mobile lý do còn mạnh hơn: đáy màn hình
 * đã thuộc về `DecisionSheet` (DESIGN_SYSTEM §6.11).
 *
 * Dải node ở đáy mockup 1–4 **không phải** stepper này — nó là `RoundTracker` (§8 #2).
 */
export function Stepper({
  projectId,
  current,
  maxReached,
}: {
  projectId: string;
  current: number;
  maxReached: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const go = (no: number) => {
    if (no > maxReached) return;
    setOpen(false);
    router.push(`/projects/${projectId}/step/${no}`);
  };

  return (
    <div className="border-hairline bg-surface sticky top-12 z-20 border-b md:top-14">
      {/* Desktop + tablet: 5 bước nằm ngang */}
      <ol className="mx-auto hidden max-w-[1400px] items-center gap-1 px-4 py-2 md:flex">
        {STEPS.map((s, i) => {
          const done = s.no < current;
          const active = s.no === current;
          const reachable = s.no <= maxReached;
          return (
            <li key={s.step} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => go(s.no)}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left',
                  reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-55',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    done && 'bg-ok-ink text-white',
                    active && 'bg-brand-ink text-white',
                    !done && !active && 'border-hairline text-ink-4 border',
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : s.no}
                </span>
                <span
                  className={cn(
                    'truncate text-xs',
                    active ? 'text-ink-1 font-semibold' : 'text-ink-3',
                  )}
                >
                  {s.short}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="bg-hairline hidden h-px flex-1 lg:block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: chấm + "Bước 3/5" + tên bước; bấm mở StepPickerSheet (§6.6) */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left md:hidden"
          >
            <span className="flex items-center gap-1" aria-hidden>
              {STEPS.map((s) => (
                <span
                  key={s.step}
                  className={cn(
                    'size-1.5 rounded-full',
                    s.no < current && 'bg-ok-ink',
                    s.no === current && 'bg-brand-ink',
                    s.no > current && 'bg-hairline',
                  )}
                />
              ))}
            </span>
            <span className="text-ink-3 text-xs">Bước {current}/5</span>
            <span className="text-ink-1 min-w-0 flex-1 truncate text-sm font-medium">
              {STEPS[current - 1]?.short}
            </span>
            <ChevronDown className="text-ink-3 size-4 shrink-0" aria-hidden />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="pb-safe">
          <SheetHeader>
            <SheetTitle>Các bước</SheetTitle>
          </SheetHeader>
          <ol className="space-y-1 px-3 pb-4">
            {STEPS.map((s) => {
              const reachable = s.no <= maxReached;
              return (
                <li key={s.step}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => go(s.no)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-3 text-left',
                      s.no === current && 'bg-brand-soft',
                      reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        s.no < current && 'bg-ok-ink text-white',
                        s.no === current && 'bg-brand-ink text-white',
                        s.no > current && 'border-hairline text-ink-4 border',
                      )}
                    >
                      {s.no < current ? <Check className="size-3.5" aria-hidden /> : s.no}
                    </span>
                    <span className="text-ink-1 min-w-0 text-sm">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </SheetContent>
      </Sheet>
    </div>
  );
}
