'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HintBox } from '@/components/hint-box';
import { StatusChip } from '@/components/status-chip';
import { ApiError, api } from '@/lib/api';
import { CARD_STATUS_STYLE } from '@/lib/status-style';
import { styleOr } from '@/lib/unknown-style';
import {
  CARD_STATUSES,
  CARD_TYPE_LABEL,
  type AnalysisMeta,
  type ApiCard,
  type CardStatus,
  type CardType,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * **The concept map of the idea at step 1** — issue #14 (lane C).
 *
 * The brief suggests answering *"did I understand your idea correctly?"* with a **diagram · concept
 * map · component list · animation of the research flow**. The MVP answers with a paragraph plus a
 * card board; the user has to do the cross-checking in their head.
 *
 * ## The edges here are STRUCTURAL, not semantic
 *
 * `generatedCardSchema` has no field describing a relation between two cards, and while
 * `Card.parent_card_id` exists as a column, **no line of code ever writes to it**. So this map
 * connects by *structure*: idea → card-type group → card. Drawing semantic edges the data does not
 * carry would be inventing relations.
 *
 * ## The layout is a pure function of the data
 *
 * No force-directed algorithm: it involves randomness and produces a different picture every time.
 * For a research tool, "same data, same picture" is worth more than a prettier one — the user
 * remembers where a card sat between two visits.
 */

const W = 860;
const H = 560;
const CX = W / 2;
const CY = H / 2;
const R_TYPE = 132;
const R_CARD = 236;

/**
 * `CARD_STATUS_BAR` in `status-style.ts` yields **background** classes (`bg-ok-ink`), while SVG
 * needs `fill-*`.
 *
 * These must be re-declared as literals rather than **derived at runtime**: Tailwind scans the
 * source for class names, so `'bg-ok-ink'.replace('bg-','fill-')` produces a string the compiler
 * never sees, and that class would simply not exist in the CSS.
 *
 * ⚠️ Change a status colour token in `status-style.ts` and you must change it here too.
 */
const STATUS_FILL: Record<CardStatus, string> = {
  CONFIRMED: 'fill-ok-ink',
  PROPOSED: 'fill-brand-ink',
  MISSING: 'fill-neutral-line',
  AMBIGUOUS: 'fill-warn-ink',
  UNSUPPORTED: 'fill-danger-ink',
  CONFLICT: 'fill-decide-ink',
};

/**
 * Label/colour lookups by `status` that **tolerate unknown values**.
 *
 * `Record<CardStatus, …>` makes TypeScript believe every key exists, but `status` here comes from
 * the **API at runtime**, not the compiler: if the backend adds a seventh status before the
 * frontend syncs its enum, the lookup returns `undefined` and `.label` on `undefined` blanks the
 * whole page.
 *
 * This map exposes that more readily than `CardBoard`: `CardBoard` wraps cards in accordions so a
 * closed group is **never mounted**, while the map draws **every** card immediately.
 *
 * The remedy: show the unknown value verbatim instead of crashing — the user sees that something
 * does not line up, and the developer reads straight off which value caused it.
 */
function labelOf(status: CardStatus): string {
  return styleOr(CARD_STATUS_STYLE, status).label;
}

function fillOf(status: CardStatus): string {
  return STATUS_FILL[status] ?? 'fill-neutral-line';
}

type Node = {
  card: ApiCard;
  x: number;
  y: number;
  /** Reveal order — drives the branch-by-branch build-up animation. */
  order: number;
};

type Group = { type: CardType; angle: number; x: number; y: number; nodes: Node[] };

/**
 * Truncate a **card title** to fit its box — a title is free prose, and a cut one is still guessable.
 *
 * A **card-type** label is never cut: it is one of the 8 category names, and "Research ga…" loses
 * its meaning. The group box is widened to fit the longest label instead of trimming the text.
 */
function short(s: string, max = 26): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function layout(cards: ApiCard[]): Group[] {
  const byType = new Map<CardType, ApiCard[]>();
  for (const c of cards) {
    const list = byType.get(c.type) ?? [];
    list.push(c);
    byType.set(c.type, list);
  }
  const types = [...byType.keys()];
  let order = 0;

  return types.map((type, ti) => {
    // Start at -90° so the first group sits at the top and reading runs clockwise.
    const angle = (ti / types.length) * Math.PI * 2 - Math.PI / 2;
    const list = byType.get(type) ?? [];
    // Fan the cards of one group around that group's axis.
    const spread = Math.min(0.44, (Math.PI * 2) / types.length / 1.6);
    const nodes = list.map((card, i) => {
      const t = list.length === 1 ? 0 : i / (list.length - 1) - 0.5;
      const a = angle + t * spread * 2;
      return {
        card,
        x: CX + Math.cos(a) * R_CARD,
        y: CY + Math.sin(a) * R_CARD,
        order: order++,
      };
    });
    return {
      type,
      angle,
      x: CX + Math.cos(angle) * R_TYPE,
      y: CY + Math.sin(angle) * R_TYPE,
      nodes,
    };
  });
}

export function ConceptMap({
  projectId,
  meta,
  cards,
}: {
  projectId: string;
  meta: AnalysisMeta | null;
  cards: ApiCard[];
}) {
  const groups = useMemo(() => layout(cards), [cards]);
  const [editing, setEditing] = useState<ApiCard | null>(null);

  if (cards.length === 0) {
    return (
      <p className="text-ink-3 text-xs">No cards yet to build a map from.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="border-hairline bg-sunken overflow-x-auto rounded-lg border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[680px]"
          role="img"
          aria-label={`Concept map of ${cards.length} cards across ${groups.length} types`}
        >
          {/* ── edges: idea → type group → card ───────────────────────────── */}
          <g className="stroke-hairline" strokeWidth={1.5} fill="none">
            {groups.map((g) => (
              <line key={`e-${g.type}`} x1={CX} y1={CY} x2={g.x} y2={g.y} />
            ))}
            {groups.flatMap((g) =>
              g.nodes.map((n) => (
                <line key={`e-${n.card.id}`} x1={g.x} y1={g.y} x2={n.x} y2={n.y} />
              )),
            )}
          </g>

          {/* ── the centre node: the idea ──────────────────────────────────── */}
          <g className="animate-rise">
            <circle cx={CX} cy={CY} r={54} className="fill-surface stroke-brand-line" strokeWidth={2} />
            <text
              x={CX}
              y={CY - 4}
              textAnchor="middle"
              className="fill-brand-strong text-[13px] font-semibold"
            >
              Idea
            </text>
            <text x={CX} y={CY + 13} textAnchor="middle" className="fill-ink-3 text-[10px]">
              {cards.length} cards
            </text>
          </g>

          {/* ── the card-type group nodes ──────────────────────────────────── */}
          {groups.map((g, i) => (
            <g
              key={g.type}
              className="animate-rise"
              style={{ animationDelay: `${80 + i * 60}ms` }}
            >
              <rect
                x={g.x - 78}
                y={g.y - 13}
                width={156}
                height={26}
                rx={13}
                className="fill-surface stroke-hairline"
                strokeWidth={1.5}
              />
              <text
                x={g.x}
                y={g.y + 4}
                textAnchor="middle"
                className="fill-ink-2 text-[11px] font-medium"
              >
                {CARD_TYPE_LABEL[g.type]}
              </text>
            </g>
          ))}

          {/* ── card nodes · tap to edit ───────────────────────────────────── */}
          {groups.flatMap((g) =>
            g.nodes.map((n) => (
              <g
                key={n.card.id}
                className="animate-rise ease-out-quart cursor-pointer transition-opacity duration-150 hover:opacity-80"
                style={{ animationDelay: `${220 + n.order * 45}ms` }}
                onClick={() => setEditing(n.card)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEditing(n.card);
                  }
                }}
                aria-label={`Edit card ${n.card.title}`}
              >
                <rect
                  x={n.x - 74}
                  y={n.y - 17}
                  width={148}
                  height={34}
                  rx={7}
                  className="fill-surface stroke-hairline"
                  strokeWidth={1.5}
                />
                {/* The status colour rail — same grammar as `SpecCard` on the card board. */}
                <rect
                  x={n.x - 74}
                  y={n.y - 17}
                  width={5}
                  height={34}
                  rx={2.5}
                  className={fillOf(n.card.status)}
                />
                <text x={n.x - 62} y={n.y - 2} className="fill-ink-1 text-[11px] font-medium">
                  {short(n.card.title, 22)}
                </text>
                <text x={n.x - 62} y={n.y + 11} className="fill-ink-3 text-[9px]">
                  {labelOf(n.card.status)}
                </text>
              </g>
            )),
          )}
        </svg>
      </div>

      {meta?.key_problems && meta.key_problems.length > 0 && (
        <p className="text-ink-3 text-2xs">
          Key problems the system extracted: {meta.key_problems.join(' · ')}
        </p>
      )}

      <HintBox tone="info">
        Tap a card to edit it right on the map. The edges are <strong>structural</strong> (idea →
        card type → card), not semantic — the system stores no relation between two cards, so
        drawing one would be inventing it.
      </HintBox>

      <CardEditor
        projectId={projectId}
        card={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

/**
 * Edit a card in place on the map via `PATCH /cards/:id` — an **existing** endpoint, nothing new.
 * Only the three fields `patchCardSchema` accepts and the user actually needs at step 1 are exposed.
 */
function CardEditor({
  projectId,
  card,
  onClose,
}: {
  projectId: string;
  card: ApiCard | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<CardStatus>('PROPOSED');
  const [loaded, setLoaded] = useState<string | null>(null);

  /* Load the values when a different card is opened — React's "adjust state when a prop changes"
     pattern, not `useEffect` (ESLint blocks setState in an effect, and rightly so). */
  if (card && loaded !== card.id) {
    setTitle(card.title);
    setBody(card.body);
    setStatus(card.status);
    setLoaded(card.id);
  }

  const save = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/cards/${id}`, { title: title.trim(), body, status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Changes to this card have been saved.');
      onClose();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'The card could not be saved. Please try again.',
      ),
  });

  return (
    <Dialog open={card !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
          <DialogDescription>
            {card ? CARD_TYPE_LABEL[card.type] : ''} — changes are saved into the current version.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cm-title">Title</Label>
            <Textarea
              id="cm-title"
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-body">Body</Label>
            <Textarea
              id="cm-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-1.5">
              {CARD_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    'ease-out-quart cursor-pointer rounded-full transition-all duration-150',
                    s === status ? 'ring-brand-ink ring-2 ring-offset-1' : 'opacity-65',
                  )}
                >
                  <StatusChip status={s} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Later
          </Button>
          <Button
            disabled={!card || save.isPending || title.trim().length === 0}
            onClick={() => card && save.mutate(card.id)}
          >
            {save.isPending ? (
              'Saving…'
            ) : (
              <>
                <Save className="size-4" aria-hidden />
                Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Switch between the map and the card board. Two buttons instead of the shadcn `Tabs`:
 * `components/ui/**` is outside issue #14's editable scope, and two buttons suffice for two options.
 */
export function ViewToggle({
  view,
  onChange,
}: {
  view: 'map' | 'board';
  onChange: (v: 'map' | 'board') => void;
}) {
  return (
    <div className="border-hairline bg-sunken inline-flex gap-0.5 rounded-md border p-0.5">
      {(
        [
          ['map', 'Map'],
          ['board', 'Card board'],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          className={cn(
            'ease-out-quart cursor-pointer rounded px-2.5 py-1 text-xs transition-colors duration-150',
            view === v
              ? 'bg-surface text-ink-1 shadow-card font-medium'
              : 'text-ink-3 hover:text-ink-1',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
