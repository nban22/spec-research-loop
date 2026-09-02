'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Link2, Trash2, Unlink } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { SupportTag } from '@/components/support-tag';
import type { ApiCard, ApiSource, SupportLabel, VerifierFlag } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * **The drag-and-drop claim-evidence map** — issue #15 (lane C).
 *
 * The question this screen answers in one second: **which claim is dangling with no source behind
 * it.** The existing related-work table can answer it too, but only row by row; here an empty claim
 * is an empty box you see immediately.
 *
 * It uses `@dnd-kit` rather than the HTML5 Drag and Drop API: the native API **does not work on
 * touch** and offers no keyboard path. `@dnd-kit` gives both, and `KeyboardSensor` is the only
 * thing that makes drag and drop usable with a screen reader.
 *
 * Dragging is **not the only path**: every link has a real unlink button and every source a link
 * button. Dragging is faster with a mouse, but a feature reachable only by dragging is a feature
 * unusable with shaky hands, a bad trackpad, or a keyboard.
 */

export type ClaimCard = Pick<ApiCard, 'id' | 'title' | 'status' | 'type'> & {
  card_sources: {
    id: string;
    support_label: SupportLabel;
    flags: VerifierFlag[] | null;
    source: { id: string; title: string; year: number | null };
  }[];
};

type DragData = { kind: 'source'; sourceId: string } | { kind: 'link'; cardSourceId: string; sourceId: string; fromCardId: string };

/** The id of the "detach from every card" drop zone — a constant so component and test cannot drift. */
export const UNLINK_ZONE = 'unlink-zone';

export function ClaimEvidenceMap({
  claims,
  sources,
  onLink,
  onUnlink,
  onDeleteCard,
  busy = false,
}: {
  claims: ClaimCard[];
  sources: ApiSource[];
  onLink: (cardId: string, sourceId: string) => void;
  onUnlink: (cardSourceId: string) => void;
  onDeleteCard: (cardId: string) => void;
  busy?: boolean;
}) {
  const [dragging, setDragging] = useState<DragData | null>(null);
  const reduced = useReducedMotion();

  /* `activationConstraint` of 6px: without it every tap on a button inside a card is swallowed as
     the start of a drag, and the unlink button can never be pressed. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current ?? null) as DragData | null);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const data = e.active.data.current as DragData | undefined;
    const overId = e.over?.id;
    if (!data || overId === undefined) return;

    if (overId === UNLINK_ZONE) {
      if (data.kind === 'link') onUnlink(data.cardSourceId);
      return;
    }

    const targetCardId = String(overId);
    // Dropping back onto the card it already belongs to does nothing — that is a cancelled gesture, not a command.
    if (data.kind === 'link' && data.fromCardId === targetCardId) return;
    onLink(targetCardId, data.sourceId);
    /* Moving a link = attach to the new card, then detach from the old one. That order is
       deliberate: attaching first means that even if the detach fails, the evidence still exists
       somewhere — a lost link is worse than a duplicated one. */
    if (data.kind === 'link') onUnlink(data.cardSourceId);
  };

  const draggingTitle =
    dragging === null ? '' : (byId.get(dragging.sourceId)?.title ?? 'source');

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-3 md:grid-cols-[280px_1fr]">
        <SourceRail sources={sources} claims={claims} onLink={onLink} busy={busy} />

        <div className="space-y-2">
          {claims.length === 0 ? (
            <p className="text-ink-3 border-hairline rounded-lg border px-3 py-6 text-center text-xs">
              No claims yet. Run step 3 first to generate the contributions and claims.
            </p>
          ) : (
            claims.map((c) => (
              <ClaimZone
                key={c.id}
                claim={c}
                busy={busy}
                onUnlink={onUnlink}
                onDeleteCard={onDeleteCard}
              />
            ))
          )}
          <UnlinkZone active={dragging?.kind === 'link'} />
        </div>
      </div>

      {/* `DragOverlay` renders the dragged item on the top layer — without it the column's
          `overflow` clips the chip halfway as it crosses the boundary between columns. */}
      <DragOverlay dropAnimation={reduced ? null : undefined}>
        {dragging && (
          <span className="border-brand-line bg-brand-soft text-brand-strong shadow-lift inline-flex max-w-64 items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            <Link2 className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{draggingTitle}</span>
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** The left column: every source in the project. Unused sources are marked so they stand out. */
function SourceRail({
  sources,
  claims,
  onLink,
  busy,
}: {
  sources: ApiSource[];
  claims: ClaimCard[];
  onLink: (cardId: string, sourceId: string) => void;
  busy: boolean;
}) {
  const used = useMemo(
    () => new Set(claims.flatMap((c) => c.card_sources.map((cs) => cs.source.id))),
    [claims],
  );

  return (
    <div className="border-hairline bg-surface space-y-2 rounded-lg border px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-ink-1 text-sm font-medium">Sources</h2>
        <span className="text-ink-4 text-2xs">
          {used.size}/{sources.length} in use
        </span>
      </div>

      {sources.length === 0 ? (
        <p className="text-ink-3 text-xs">No sources yet. Run the source search at step 2.</p>
      ) : (
        <ul className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
          {sources.map((s) => (
            <li key={s.id}>
              <SourceChip
                source={s}
                unused={!used.has(s.id)}
                claims={claims}
                onLink={onLink}
                busy={busy}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-ink-4 text-2xs">
        Drag a source onto a claim to link it. If a mouse is not an option, use the “Link to…” button.
      </p>
    </div>
  );
}

function SourceChip({
  source,
  unused,
  claims,
  onLink,
  busy,
}: {
  source: ApiSource;
  unused: boolean;
  claims: ClaimCard[];
  onLink: (cardId: string, sourceId: string) => void;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source:${source.id}`,
    data: { kind: 'source', sourceId: source.id } satisfies DragData,
    disabled: busy,
  });
  const [picking, setPicking] = useState(false);

  return (
    <div
      className={cn(
        'border-hairline rounded-md border px-2 py-1.5',
        // An unused source: dashed border. Same language as "no claim cites it yet" on the source map.
        unused && 'border-dashed',
        isDragging && 'opacity-40',
      )}
    >
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        className="w-full cursor-grab text-left active:cursor-grabbing"
      >
        <span className="text-ink-1 line-clamp-2 text-xs">{source.title}</span>
        <span className="text-ink-4 text-2xs">{source.year ?? 'year unknown'}</span>
      </button>

      {/* The second path, for touch and keyboard. Dragging must never be the only way. */}
      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        aria-expanded={picking}
        className="text-brand-strong text-2xs mt-1 cursor-pointer underline underline-offset-2"
      >
        Link to…
      </button>
      {picking && (
        <ul className="mt-1 space-y-1">
          {claims.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onLink(c.id, source.id);
                  setPicking(false);
                }}
                className="text-ink-2 hover:bg-brand-soft w-full cursor-pointer rounded px-1.5 py-1 text-left text-2xs disabled:opacity-50"
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Each claim is a drop zone. An empty claim is drawn very differently — it is the point of the screen. */
function ClaimZone({
  claim,
  busy,
  onUnlink,
  onDeleteCard,
}: {
  claim: ClaimCard;
  busy: boolean;
  onUnlink: (cardSourceId: string) => void;
  onDeleteCard: (cardId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: claim.id });
  const empty = claim.card_sources.length === 0;
  const reduced = useReducedMotion();

  return (
    <motion.section
      ref={setNodeRef}
      layout={!reduced}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
      aria-label={`Claim ${claim.title}`}
      className={cn(
        'rounded-lg border px-3 py-2.5 transition-colors duration-150',
        isOver ? 'border-brand-ink bg-brand-soft' : 'border-hairline bg-surface',
        // A dangling claim: a warning border, not small print in a corner.
        empty && !isOver && 'border-warn-line bg-warn-soft/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-ink-1 text-sm font-medium">{claim.title}</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDeleteCard(claim.id)}
          aria-label={`Delete card ${claim.title}`}
          className="text-ink-4 hover:text-danger-strong shrink-0 cursor-pointer disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      {empty ? (
        <p className="text-warn-strong text-2xs mt-1">
          No source backs this claim yet. Drag one in here.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          <AnimatePresence initial={false}>
            {claim.card_sources.map((cs) => (
              <motion.li
                key={cs.id}
                layout={!reduced}
                initial={{ opacity: 0, height: reduced ? 'auto' : 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: reduced ? 'auto' : 0 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
                className="overflow-hidden"
              >
                <LinkChip link={cs} cardId={claim.id} busy={busy} onUnlink={onUnlink} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.section>
  );
}

function LinkChip({
  link,
  cardId,
  busy,
  onUnlink,
}: {
  link: ClaimCard['card_sources'][number];
  cardId: string;
  busy: boolean;
  onUnlink: (cardSourceId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `link:${link.id}`,
    data: {
      kind: 'link',
      cardSourceId: link.id,
      sourceId: link.source.id,
      fromCardId: cardId,
    } satisfies DragData,
    disabled: busy,
  });

  return (
    <div
      className={cn(
        'border-hairline flex items-center gap-2 rounded-md border px-2 py-1.5',
        isDragging && 'opacity-40',
      )}
    >
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        className="min-w-0 flex-1 cursor-grab text-left active:cursor-grabbing"
      >
        <span className="text-ink-2 line-clamp-1 text-xs">{link.source.title}</span>
      </button>
      <SupportTag label={link.support_label} flags={link.flags} />
      <button
        type="button"
        disabled={busy}
        onClick={() => onUnlink(link.id)}
        aria-label={`Detach source ${link.source.title} from this claim`}
        className="text-ink-4 hover:text-danger-strong shrink-0 cursor-pointer disabled:opacity-50"
      >
        <Unlink className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The detach drop zone. It only appears while **a link** is being dragged — always on, it would
 * take up space and invite destructive gestures; shown while dragging an unlinked source, it would
 * mean nothing.
 */
function UnlinkZone({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNLINK_ZONE });
  const reduced = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.div
          ref={setNodeRef}
          initial={{ opacity: 0, height: reduced ? 'auto' : 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: reduced ? 'auto' : 0 }}
          transition={{ duration: reduced ? 0 : 0.16 }}
          aria-label="Drop here to remove the link"
          className={cn(
            'flex items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-dashed py-3 text-xs',
            isOver
              ? 'border-danger-ink bg-danger-soft text-danger-strong'
              : 'border-hairline text-ink-3',
          )}
        >
          <Unlink className="size-3.5" aria-hidden />
          Drop here to detach from the claim
        </motion.div>
      )}
    </AnimatePresence>
  );
}
