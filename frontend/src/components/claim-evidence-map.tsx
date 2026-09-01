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
 * **Bản đồ claim–evidence kéo thả** — issue #15 (làn C).
 *
 * Câu hỏi mà màn hình này trả lời trong một giây: **claim nào đang treo, không có nguồn nào đỡ.**
 * Bảng related-work hiện có trả lời được, nhưng phải đọc từng dòng; ở đây một claim rỗng là một
 * ô trống nhìn thấy ngay.
 *
 * Dùng `@dnd-kit` chứ không phải HTML5 Drag and Drop API: API gốc **không chạy trên cảm ứng**, và
 * không có đường đi bằng bàn phím. `@dnd-kit` cho cả hai, và `KeyboardSensor` là thứ duy nhất làm
 * kéo thả dùng được với trình đọc màn hình.
 *
 * Kéo thả **không phải đường duy nhất**: mỗi liên kết có nút gỡ thật, mỗi nguồn có nút nối. Kéo
 * thả nhanh hơn cho chuột, nhưng một tính năng chỉ dùng được bằng cách kéo là một tính năng không
 * dùng được bằng ngón tay run, bằng trackpad tệ, hay bằng bàn phím.
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

/** Id của vùng thả "gỡ khỏi mọi thẻ" — tách hằng số để component và test không lệch chuỗi. */
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

  /* `activationConstraint` 6px: không có nó thì mọi cú bấm vào nút bên trong thẻ đều bị nuốt
     thành thao tác kéo, và nút gỡ không bao giờ bấm được. */
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
    // Thả về đúng thẻ đang chứa nó thì không làm gì — đó là thao tác bị huỷ, không phải lệnh.
    if (data.kind === 'link' && data.fromCardId === targetCardId) return;
    onLink(targetCardId, data.sourceId);
    /* Chuyển thẻ = nối vào thẻ mới rồi gỡ khỏi thẻ cũ. Cố ý theo thứ tự đó: nối trước thì kể cả
       khi lệnh gỡ hỏng, bằng chứng vẫn còn ở đâu đó — mất liên kết còn tệ hơn thừa liên kết. */
    if (data.kind === 'link') onUnlink(data.cardSourceId);
  };

  const draggingTitle =
    dragging === null ? '' : (byId.get(dragging.sourceId)?.title ?? 'nguồn');

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-3 md:grid-cols-[280px_1fr]">
        <SourceRail sources={sources} claims={claims} onLink={onLink} busy={busy} />

        <div className="space-y-2">
          {claims.length === 0 ? (
            <p className="text-ink-3 border-hairline rounded-lg border px-3 py-6 text-center text-xs">
              Chưa có claim nào. Bạn chạy bước 3 để sinh contribution và claim trước.
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

      {/* `DragOverlay` vẽ vật đang kéo ở tầng trên cùng — không có nó thì thẻ bị `overflow`
          của cột cắt mất giữa chừng khi kéo qua ranh giới hai cột. */}
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

/** Cột trái: mọi nguồn của dự án. Nguồn chưa claim nào dùng được đánh dấu để nhìn ra ngay. */
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
        <h2 className="text-ink-1 text-sm font-medium">Nguồn</h2>
        <span className="text-ink-4 text-2xs">
          {used.size}/{sources.length} đang dùng
        </span>
      </div>

      {sources.length === 0 ? (
        <p className="text-ink-3 text-xs">Chưa có nguồn nào. Bạn chạy tìm nguồn ở bước 2.</p>
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
        Kéo một nguồn thả vào claim để nối. Không dùng chuột được thì bấm nút “Nối vào…”.
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
        // Nguồn chưa ai dùng: viền đứt. Cùng ngôn ngữ với "chưa claim nào trích" ở bản đồ nguồn.
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
        <span className="text-ink-4 text-2xs">{source.year ?? 'không rõ năm'}</span>
      </button>

      {/* Đường đi thứ hai, cho cảm ứng và bàn phím. Kéo thả không được là đường duy nhất. */}
      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        aria-expanded={picking}
        className="text-brand-strong text-2xs mt-1 cursor-pointer underline underline-offset-2"
      >
        Nối vào…
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

/** Một claim là một vùng thả. Claim rỗng vẽ khác hẳn — đó là thứ đáng nhìn nhất màn hình. */
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
        // Claim treo: viền cảnh báo, không phải chữ nhỏ ở góc.
        empty && !isOver && 'border-warn-line bg-warn-soft/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-ink-1 text-sm font-medium">{claim.title}</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDeleteCard(claim.id)}
          aria-label={`Xoá thẻ ${claim.title}`}
          className="text-ink-4 hover:text-danger-strong shrink-0 cursor-pointer disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      {empty ? (
        <p className="text-warn-strong text-2xs mt-1">
          Claim này chưa có nguồn nào đỡ. Bạn kéo một nguồn vào đây.
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
        aria-label={`Gỡ nguồn ${link.source.title} khỏi claim`}
        className="text-ink-4 hover:text-danger-strong shrink-0 cursor-pointer disabled:opacity-50"
      >
        <Unlink className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Vùng thả để gỡ. Chỉ hiện khi đang kéo **một liên kết** — hiện thường trực thì nó chiếm chỗ và
 * mời gọi thao tác phá, còn hiện lúc kéo một nguồn chưa nối thì nó vô nghĩa.
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
          aria-label="Thả vào đây để gỡ liên kết"
          className={cn(
            'flex items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-dashed py-3 text-xs',
            isOver
              ? 'border-danger-ink bg-danger-soft text-danger-strong'
              : 'border-hairline text-ink-3',
          )}
        >
          <Unlink className="size-3.5" aria-hidden />
          Thả vào đây để gỡ khỏi claim
        </motion.div>
      )}
    </AnimatePresence>
  );
}
