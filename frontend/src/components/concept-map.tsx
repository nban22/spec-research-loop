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
 * **Concept map của ý tưởng ở bước 1** — issue #14 (làn C).
 *
 * Đề gợi ý trả lời câu *"tôi hiểu đúng ý tưởng của bạn không?"* bằng **sơ đồ · concept map ·
 * danh sách thành phần · animation mô tả luồng nghiên cứu**. MVP đang trả lời bằng một đoạn văn
 * cộng một bảng thẻ; người dùng phải tự đối chiếu trong đầu.
 *
 * ## Cạnh ở đây là cạnh CẤU TRÚC, không phải quan hệ ngữ nghĩa
 *
 * `generatedCardSchema` không có trường nào mô tả quan hệ giữa hai thẻ, và `Card.parent_card_id`
 * tuy có cột nhưng **không dòng code nào ghi vào**. Nên bản đồ này nối theo *cấu trúc*:
 * ý tưởng → nhóm loại thẻ → thẻ. Vẽ cạnh ngữ nghĩa mà dữ liệu không có sẽ là bịa ra quan hệ.
 *
 * ## Bố cục là hàm thuần của dữ liệu
 *
 * Không dùng thuật toán lực (force-directed): nó có yếu tố ngẫu nhiên và mỗi lần mở lại ra một
 * hình khác. Với một công cụ nghiên cứu thì "cùng dữ liệu, cùng hình" đáng giá hơn hình đẹp —
 * người dùng nhớ được vị trí thẻ giữa hai lần xem.
 */

const W = 860;
const H = 560;
const CX = W / 2;
const CY = H / 2;
const R_TYPE = 132;
const R_CARD = 236;

/**
 * `CARD_STATUS_BAR` ở `status-style.ts` cho class **nền** (`bg-ok-ink`), còn SVG cần `fill-*`.
 *
 * Phải khai lại thành literal chứ **không** biến đổi chuỗi lúc chạy: Tailwind quét mã nguồn để
 * tìm tên class, nên `'bg-ok-ink'.replace('bg-','fill-')` sinh ra một chuỗi trình biên dịch
 * không bao giờ nhìn thấy, và class đó sẽ không tồn tại trong CSS.
 *
 * ⚠️ Đổi token màu của một trạng thái ở `status-style.ts` thì đổi cả ở đây.
 */
const STATUS_FILL: Record<CardStatus, string> = {
  CONFIRMED: 'fill-ok-ink',
  PROPOSED: 'fill-brand-ink',
  MISSING: 'fill-neutral-line',
  AMBIGUOUS: 'fill-warn-ink',
  UNSUPPORTED: 'fill-danger-ink',
  CONFLICT: 'fill-decide-ink',
};

type Node = {
  card: ApiCard;
  x: number;
  y: number;
  /** Thứ tự hiện ra — dùng cho hiệu ứng dựng dần từng nhánh. */
  order: number;
};

type Group = { type: CardType; angle: number; x: number; y: number; nodes: Node[] };

/**
 * Cắt **tiêu đề thẻ** cho vừa ô — tiêu đề là câu tự do, cắt vẫn đoán được nội dung.
 *
 * Nhãn **loại thẻ** thì không cắt: đó là tên phân loại trong bộ 8 loại, cắt thành
 * "Khoảng trống nghi…" là mất nghĩa. Ô nhóm nới rộng cho vừa nhãn dài nhất thay vì cắt chữ.
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
    // Bắt đầu từ -90° để nhóm đầu tiên nằm trên đỉnh, đọc theo chiều kim đồng hồ.
    const angle = (ti / types.length) * Math.PI * 2 - Math.PI / 2;
    const list = byType.get(type) ?? [];
    // Quạt các thẻ trong cùng một nhóm quanh trục của nhóm đó.
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
      <p className="text-ink-3 text-xs">Chưa có thẻ nào để dựng bản đồ.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="border-hairline bg-sunken overflow-x-auto rounded-lg border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[680px]"
          role="img"
          aria-label={`Bản đồ khái niệm gồm ${cards.length} thẻ thuộc ${groups.length} loại`}
        >
          {/* ── cạnh: ý tưởng → nhóm loại → thẻ ───────────────────────────── */}
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

          {/* ── nút trung tâm: ý tưởng ─────────────────────────────────────── */}
          <g className="animate-rise">
            <circle cx={CX} cy={CY} r={54} className="fill-surface stroke-brand-line" strokeWidth={2} />
            <text
              x={CX}
              y={CY - 4}
              textAnchor="middle"
              className="fill-brand-strong text-[13px] font-semibold"
            >
              Ý tưởng
            </text>
            <text x={CX} y={CY + 13} textAnchor="middle" className="fill-ink-3 text-[10px]">
              {cards.length} thẻ
            </text>
          </g>

          {/* ── nút nhóm loại thẻ ──────────────────────────────────────────── */}
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

          {/* ── nút thẻ · bấm để sửa ───────────────────────────────────────── */}
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
                aria-label={`Sửa thẻ ${n.card.title}`}
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
                {/* Vạch màu trạng thái — cùng ngữ pháp với `SpecCard` ở bảng thẻ. */}
                <rect
                  x={n.x - 74}
                  y={n.y - 17}
                  width={5}
                  height={34}
                  rx={2.5}
                  className={STATUS_FILL[n.card.status]}
                />
                <text x={n.x - 62} y={n.y - 2} className="fill-ink-1 text-[11px] font-medium">
                  {short(n.card.title, 22)}
                </text>
                <text x={n.x - 62} y={n.y + 11} className="fill-ink-3 text-[9px]">
                  {CARD_STATUS_STYLE[n.card.status].label}
                </text>
              </g>
            )),
          )}
        </svg>
      </div>

      {meta?.key_problems && meta.key_problems.length > 0 && (
        <p className="text-ink-3 text-2xs">
          Vấn đề chính hệ thống rút ra: {meta.key_problems.join(' · ')}
        </p>
      )}

      <HintBox tone="info">
        Bấm vào một thẻ để sửa ngay trên bản đồ. Cạnh nối là <strong>cấu trúc</strong> (ý tưởng →
        loại thẻ → thẻ), không phải quan hệ ngữ nghĩa — hệ thống chưa lưu quan hệ giữa hai thẻ,
        nên vẽ ra sẽ là bịa.
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
 * Sửa thẻ ngay tại bản đồ qua `PATCH /cards/:id` — endpoint **đã có**, không thêm cái nào mới.
 * Chỉ mở ba trường mà `patchCardSchema` nhận và người dùng thực sự cần ở bước 1.
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

  /* Nạp giá trị khi mở một thẻ khác — mẫu "điều chỉnh state khi prop đổi" của React, không
     dùng `useEffect` (ESLint chặn setState trong effect, và chặn đúng). */
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
      toast.success('Đã lưu thay đổi cho thẻ này.');
      onClose();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Hệ thống chưa lưu được thẻ. Bạn vui lòng thử lại.',
      ),
  });

  return (
    <Dialog open={card !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sửa thẻ</DialogTitle>
          <DialogDescription>
            {card ? CARD_TYPE_LABEL[card.type] : ''} — thay đổi lưu ngay vào phiên bản hiện tại.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cm-title">Tiêu đề</Label>
            <Textarea
              id="cm-title"
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-body">Nội dung</Label>
            <Textarea
              id="cm-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Trạng thái</Label>
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
            Để sau
          </Button>
          <Button
            disabled={!card || save.isPending || title.trim().length === 0}
            onClick={() => card && save.mutate(card.id)}
          >
            {save.isPending ? (
              'Hệ thống đang lưu…'
            ) : (
              <>
                <Save className="size-4" aria-hidden />
                Lưu thay đổi
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Chuyển giữa bản đồ và bảng thẻ. Hai nút thay vì `Tabs` của shadcn: `components/ui/**` nằm
 * ngoài phạm vi được sửa của issue #14, và hai nút là đủ cho hai lựa chọn.
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
          ['map', 'Bản đồ'],
          ['board', 'Bảng thẻ'],
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
