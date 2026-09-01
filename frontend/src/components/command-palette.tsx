'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Coins,
  CornerDownLeft,
  FolderOpen,
  Home,
  LifeBuoy,
  Network,
  Map,
  Search,
  ClipboardCheck,
  ShieldQuestion,
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
 * The ⌘K / Ctrl+K command palette.
 *
 * Built on `Dialog` + plain React filtering, **with no new dependency** — `cmdk` would only buy
 * fuzzy matching and some focus management, and the Radix `Dialog` already handles the focus trap.
 *
 * Why it exists: the app has 5 steps × N projects, and the only way to jump between steps lives
 * inside `Stepper` — which means opening the right project first. The palette goes straight there
 * from anywhere.
 */

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
};

/** Strip diacritics so an unaccented query still matches an accented title — paper titles carry plenty. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0111/g, 'd');
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);

  /* Reset in the handler, not in `useEffect([open])`: setState from an effect costs an extra
     render pass, and ESLint blocks it for exactly that reason (react-hooks/set-state-in-effect). */
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
      { id: 'n-home', label: 'Home', group: 'Navigation', icon: Home, run: go('/') },
      { id: 'n-proj', label: 'Projects', group: 'Navigation', icon: FolderOpen, run: go('/projects') },
      {
        id: 'n-ver',
        label: 'Version history',
        group: 'Navigation',
        icon: Workflow,
        run: go('/versions'),
      },
      { id: 'n-help', label: 'Help', group: 'Navigation', icon: LifeBuoy, run: go('/help') },
    ];

    const projects = data?.projects ?? [];
    const openProject: Cmd[] = projects.map((p) => ({
      id: `p-${p.id}`,
      label: p.title,
      hint: `Step ${STEPS.find((s) => s.step === p.step)?.no ?? 1}/5`,
      group: 'Open project',
      icon: FolderOpen,
      run: go(`/projects/${p.id}/step/${STEPS.find((s) => s.step === p.step)?.no ?? 1}`),
    }));

    /* The two lane-C screens have no nav entry of their own: `top-nav.tsx` is outside this lane's
       ownership. The palette is a legitimate entry point and where users look for them anyway. */
    const cost: Cmd[] = projects.map((p) => ({
      id: `cost-${p.id}`,
      label: `Cost · ${p.title}`,
      hint: 'tokens · time · money',
      group: 'Cost',
      icon: Coins,
      run: go(`/projects/${p.id}/cost`),
    }));

    const errors: Cmd[] = projects.map((p) => ({
      id: `err-${p.id}`,
      label: `Error analysis · ${p.title}`,
      hint: 'flags · labels · thresholds',
      group: 'Analysis',
      icon: ShieldAlert,
      run: go(`/projects/${p.id}/errors`),
    }));

    /* The source map (#16) — same reason as the cost screen: `top-nav.tsx` is outside lane C's
       ownership, so the palette is a legitimate entry point. */
    const map: Cmd[] = projects.map((p) => ({
      id: `map-${p.id}`,
      label: `Source map · ${p.title}`,
      hint: 'timeline · topics',
      group: 'Source map',
      icon: Map,
      run: go(`/projects/${p.id}/map`),
    }));

    // Cost simulation (#18) — same reason as the two screens above.
    const sim: Cmd[] = projects.map((p) => ({
      id: `sim-${p.id}`,
      label: `Cost simulation · ${p.title}`,
      hint: 'VRAM · Pareto',
      group: 'Cost simulation',
      icon: SlidersHorizontal,
      run: go(`/projects/${p.id}/simulate`),
    }));

    /* The two lane-A screens (#5, #4) — same reason as the lane-C ones: `top-nav.tsx` only holds
       global links and cannot carry a `projectId`, so the palette is a legitimate entry point. */
    const evidence: Cmd[] = projects.map((p) => ({
      id: `ev-${p.id}`,
      label: `Why this label · ${p.title}`,
      hint: 'layers · thresholds · quotes',
      group: 'Evidence',
      icon: ShieldQuestion,
      run: go(`/projects/${p.id}/evidence`),
    }));

    const label: Cmd[] = projects.map((p) => ({
      id: `lb-${p.id}`,
      label: `Label evidence · ${p.title}`,
      hint: 'blind labelling · threshold calibration',
      group: 'Evidence',
      icon: ClipboardCheck,
      run: go(`/projects/${p.id}/label`),
    }));

    // The claim-evidence map (#15) — same reason as the three screens above.
    const claimMap: Cmd[] = projects.map((p) => ({
      id: `claim-${p.id}`,
      label: `Claim-evidence map · ${p.title}`,
      hint: 'drag and drop sources',
      group: 'Claim-evidence map',
      icon: Network,
      run: go(`/projects/${p.id}/claim-map`),
    }));

    // Jumping to a step only makes sense once a project exists — the most recently edited one wins.
    const latest = projects[0];
    const jump: Cmd[] = latest
      ? STEPS.map((s) => ({
          id: `s-${s.step}`,
          label: `Step ${s.no} · ${s.title}`,
          hint: latest.title,
          group: 'Jump to step',
          icon: Workflow,
          run: go(`/projects/${latest.id}/step/${s.no}`),
        }))
      : [];

    return [
      ...nav,
      ...openProject,
      ...cost,
      ...errors,
      ...map,
      ...sim,
      ...evidence,
      ...label,
      ...claimMap,
      ...jump,
    ];
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
        <DialogTitle className="sr-only">Command palette</DialogTitle>

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
            placeholder="Find a project, jump to a step, open a page…"
            aria-label="Search commands"
            className="text-ink-1 placeholder:text-ink-4 h-11 w-full bg-transparent text-sm outline-none"
          />
          <kbd className="border-hairline text-ink-4 text-2xs shrink-0 rounded border px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="text-ink-3 px-3 py-6 text-center text-xs">
              No command matches “{q}”.
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

/** The button that opens the palette for mouse users — a shortcut alone is a feature nobody discovers. */
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
      aria-label="Open the command palette"
      className={cn(
        'border-hairline text-ink-3 hidden items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs md:flex',
        'ease-out-quart hover:border-brand-line hover:text-brand-strong transition-colors duration-150',
      )}
    >
      <Search className="size-3.5" aria-hidden />
      <span>Quick find</span>
      <kbd className="border-hairline text-2xs rounded border px-1 py-px">Ctrl K</kbd>
    </button>
  );
}
