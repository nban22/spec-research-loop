'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Coins,
  CornerDownLeft,
  FolderOpen,
  Home,
  LifeBuoy,
  Map,
  Search,
  SlidersHorizontal,
  ShieldAlert,
  Workflow,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { api, qk } from '@/lib/api';
import { STEPS } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { ProjectSummary } from './project-card';

/**
 * Bảng lệnh ⌘K / Ctrl+K.
 *
 * Dựng trên `Dialog` + lọc bằng React thuần, **không thêm dependency** — `cmdk` chỉ để đổi lấy
 * fuzzy-match và một ít quản lý focus, mà `Dialog` của Radix đã lo focus trap rồi.
 *
 * Vì sao cần: app có 5 bước × N dự án, và đường duy nhất để nhảy bước đang nằm trong `Stepper`
 * — tức là phải mở đúng dự án rồi mới thấy. Bảng lệnh cho phép đi thẳng từ bất kỳ đâu.
 */

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
};

/** Bỏ dấu để gõ "du an" vẫn ra "Dự án" — người Việt gõ không dấu là chuyện thường. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);

  /* Reset ở handler chứ không ở `useEffect([open])`: gọi setState trong effect là một vòng
     render thừa, và ESLint chặn đúng lý do đó (react-hooks/set-state-in-effect). */
  const reset = () => {
    setQ('');
    setCursor(0);
  };

  const { data } = useQuery({
    queryKey: qk.projects,
    queryFn: () => api.get<{ projects: ProjectSummary[] }>('/projects'),
    enabled: open,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const nav: Cmd[] = [
      { id: 'n-home', label: 'Trang chủ', group: 'Điều hướng', icon: Home, run: go('/') },
      { id: 'n-proj', label: 'Dự án', group: 'Điều hướng', icon: FolderOpen, run: go('/projects') },
      {
        id: 'n-ver',
        label: 'Lịch sử phiên bản',
        group: 'Điều hướng',
        icon: Workflow,
        run: go('/versions'),
      },
      { id: 'n-help', label: 'Trợ giúp', group: 'Điều hướng', icon: LifeBuoy, run: go('/help') },
    ];

    const projects = data?.projects ?? [];
    const openProject: Cmd[] = projects.map((p) => ({
      id: `p-${p.id}`,
      label: p.title,
      hint: `Bước ${STEPS.find((s) => s.step === p.step)?.no ?? 1}/5`,
      group: 'Mở dự án',
      icon: FolderOpen,
      run: go(`/projects/${p.id}/step/${STEPS.find((s) => s.step === p.step)?.no ?? 1}`),
    }));

    /* Hai màn của làn C không có mục nav riêng: `top-nav.tsx` nằm ngoài phạm vi sở hữu của
       làn này. Bảng lệnh là đường vào hợp lệ và cũng là chỗ người dùng tìm chúng tự nhiên nhất. */
    const cost: Cmd[] = projects.map((p) => ({
      id: `cost-${p.id}`,
      label: `Chi phí · ${p.title}`,
      hint: 'token · thời gian · tiền',
      group: 'Chi phí',
      icon: Coins,
      run: go(`/projects/${p.id}/cost`),
    }));

    const errors: Cmd[] = projects.map((p) => ({
      id: `err-${p.id}`,
      label: `Phân tích lỗi · ${p.title}`,
      hint: 'cờ · nhãn · ngưỡng',
      group: 'Phân tích',
      icon: ShieldAlert,
      run: go(`/projects/${p.id}/errors`),
    }));

    /* Bản đồ nguồn (#16) — cùng lý do với màn hình chi phí: `top-nav.tsx` nằm ngoài phạm vi
       sở hữu của làn C, nên bảng lệnh là đường vào hợp lệ. */
    const map: Cmd[] = projects.map((p) => ({
      id: `map-${p.id}`,
      label: `Bản đồ nguồn · ${p.title}`,
      hint: 'timeline · chủ đề',
      group: 'Bản đồ nguồn',
      icon: Map,
      run: go(`/projects/${p.id}/map`),
    }));

    // Mô phỏng chi phí (#18) — cùng lý do với hai màn hình trên.
    const sim: Cmd[] = projects.map((p) => ({
      id: `sim-${p.id}`,
      label: `Mô phỏng chi phí · ${p.title}`,
      hint: 'VRAM · Pareto',
      group: 'Mô phỏng chi phí',
      icon: SlidersHorizontal,
      run: go(`/projects/${p.id}/simulate`),
    }));

    // Nhảy bước chỉ có nghĩa khi đã có dự án — lấy dự án sửa gần nhất làm đích.
    const latest = projects[0];
    const jump: Cmd[] = latest
      ? STEPS.map((s) => ({
          id: `s-${s.step}`,
          label: `Bước ${s.no} · ${s.title}`,
          hint: latest.title,
          group: 'Nhảy bước',
          icon: Workflow,
          run: go(`/projects/${latest.id}/step/${s.no}`),
        }))
      : [];

    return [...nav, ...openProject, ...cost, ...errors, ...map, ...sim, ...jump];
  }, [data, router]);

  const results = useMemo(() => {
    if (!q.trim()) return commands.slice(0, 12);
    const needle = fold(q);
    return commands
      .filter((c) => fold(`${c.label} ${c.hint ?? ''} ${c.group}`).includes(needle))
      .slice(0, 12);
  }, [commands, q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[cursor]?.run();
    }
  };

  let lastGroup = '';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) reset();
      }}
    >
      <DialogContent className="top-24 max-w-lg translate-y-0 gap-0 p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Bảng lệnh</DialogTitle>

        <div className="border-hairline flex items-center gap-2 border-b px-3">
          <Search className="text-ink-4 size-4 shrink-0" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Tìm dự án, nhảy bước, mở trang…"
            aria-label="Tìm lệnh"
            className="text-ink-1 placeholder:text-ink-4 h-11 w-full bg-transparent text-sm outline-none"
          />
          <kbd className="border-hairline text-ink-4 text-2xs shrink-0 rounded border px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="text-ink-3 px-3 py-6 text-center text-xs">
              Không có lệnh nào khớp “{q}”.
            </li>
          )}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <li key={c.id}>
                {header && (
                  <p className="text-ink-4 text-2xs px-2 pt-2 pb-1 font-medium">{header}</p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={c.run}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left',
                    'ease-out-quart transition-colors duration-150',
                    i === cursor ? 'bg-brand-soft text-brand-strong' : 'text-ink-2',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
                  {c.hint && <span className="text-ink-4 shrink-0 text-2xs">{c.hint}</span>}
                  {i === cursor && (
                    <CornerDownLeft className="text-ink-4 size-3.5 shrink-0" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Nút mở bảng lệnh cho người dùng chuột — phím tắt một mình thì không ai biết nó tồn tại. */
export function CommandPaletteTrigger() {
  const openPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
  };
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Mở bảng lệnh"
      className={cn(
        'border-hairline text-ink-3 hidden items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs md:flex',
        'ease-out-quart hover:border-brand-line hover:text-brand-strong transition-colors duration-150',
      )}
    >
      <Search className="size-3.5" aria-hidden />
      <span>Tìm nhanh</span>
      <kbd className="border-hairline text-2xs rounded border px-1 py-px">Ctrl K</kbd>
    </button>
  );
}
