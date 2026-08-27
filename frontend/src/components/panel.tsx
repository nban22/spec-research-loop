import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export type PanelAccent = 'brand' | 'ok' | 'decide' | 'neutral';

/**
 * Card cấp một có accent — viên gạch dựng nên mọi cột (DESIGN_SYSTEM §5.3).
 * Mỗi cột một vai, vai nào màu đó: trái = ngữ cảnh (`brand`), giữa = nội dung hệ thống sinh
 * (`ok`/trung tính), phải = chỗ phải quyết (`decide`) — §1 nguyên tắc 2.
 *
 * Chỉ card cấp một mới có bóng, và bóng gần như không thấy (§4.5).
 */
const ACCENT: Record<
  PanelAccent,
  { border: string; rule: string; tile: string; title: string }
> = {
  brand: {
    border: 'border-brand-line',
    rule: 'bg-brand-line',
    tile: 'bg-brand-soft text-brand-ink',
    title: 'text-brand-strong',
  },
  ok: {
    border: 'border-ok-line',
    rule: 'bg-ok-line',
    tile: 'bg-ok-soft text-ok-ink',
    title: 'text-ok-strong',
  },
  decide: {
    border: 'border-decide-line',
    rule: 'bg-decide-line',
    tile: 'bg-decide-soft text-decide-ink',
    title: 'text-decide-strong',
  },
  neutral: {
    border: 'border-hairline',
    rule: 'bg-hairline',
    tile: 'bg-sunken text-ink-2',
    title: 'text-ink-1',
  },
};

export function Panel({
  accent = 'neutral',
  icon: Icon,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  accent?: PanelAccent;
  icon?: LucideIcon;
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const a = ACCENT[accent];
  return (
    <section
      className={cn(
        'bg-surface shadow-card rounded-xl border',
        a.border,
        className,
      )}
    >
      {title && (
        <header className="flex items-start gap-2.5 px-3 py-2.5 sm:px-4">
          {Icon && (
            <span className={cn('rounded-md p-1.5', a.tile)}>
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <h2 className={cn('min-w-0 flex-1 pt-1 text-sm font-semibold', a.title)}>
            {title}
          </h2>
          {action}
        </header>
      )}
      {/* Kẻ ngang dùng `Separator` của Radix: nó tự gắn `role`/`aria-orientation`.
          Lưu ý màu phải là `bg-*` chứ không `border-*` — component vẽ bằng nền, không bằng viền. */}
      {title && <Separator className={a.rule} />}
      <div className={cn('space-y-3 px-3 py-3 sm:px-4', bodyClassName)}>{children}</div>
    </section>
  );
}
