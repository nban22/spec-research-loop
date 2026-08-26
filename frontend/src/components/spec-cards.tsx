'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  CARD_STATUSES,
  CARD_TYPES,
  CARD_TYPE_LABEL,
  type ApiCard,
  type CardStatus,
} from '@/lib/types';
import { CARD_STATUS_BAR, CARD_STATUS_STYLE } from '@/lib/status-style';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';
import { StatusChip } from './status-chip';
import { SupportTag } from './support-tag';

/**
 * Một thẻ trong 8 loại: **vạch màu trạng thái cạnh trái** + `StatusChip` + nội dung + nguồn
 * đính kèm (DESIGN_SYSTEM §3.7). Thẻ **không** tô nền theo trạng thái — sáu nền màu cạnh nhau
 * sẽ rối. Riêng `MISSING`: viền đứt nét, nền chìm, chữ mờ — thẻ trông như một ô còn trống
 * chờ điền, vì đó chính xác là nó.
 */
export function SpecCard({ card }: { card: ApiCard }) {
  const missing = card.status === 'MISSING';
  const payload = card.payload ?? {};
  const extras = Object.entries(payload).filter(
    ([k, v]) => k !== 'role' && typeof v === 'string' && v.length > 0,
  );

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-lg border pl-3',
        missing ? 'border-hairline bg-sunken border-dashed' : 'border-hairline bg-surface',
      )}
    >
      <span
        className={cn('absolute inset-y-0 left-0 w-1', CARD_STATUS_BAR[card.status])}
        aria-hidden
      />
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4
            className={cn(
              'min-w-0 flex-1 text-sm font-medium',
              missing ? 'text-ink-3' : 'text-ink-1',
            )}
          >
            {card.title}
          </h4>
          <StatusChip status={card.status} />
        </div>

        {card.body && (
          <p className={cn('text-xs leading-relaxed', missing ? 'text-ink-4' : 'text-ink-2')}>
            {card.body}
          </p>
        )}

        {extras.length > 0 && (
          <dl className="space-y-1">
            {extras.map(([k, v]) => (
              <div key={k} className="text-xs">
                <dt className="text-ink-3 font-medium">{FIELD_LABEL[k] ?? k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {card.card_sources.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {card.card_sources.map((cs) => (
              <li key={cs.id} className="border-hairline space-y-1 border-t pt-1.5">
                <p className="text-ink-2 text-xs">
                  {cs.source.title}
                  {cs.source.year ? ` (${cs.source.year})` : ''}
                </p>
                <SupportTag label={cs.support_label} flags={cs.flags} />
                {cs.evidence_sentence && (
                  <p className="text-ink-3 border-hairline border-l-2 pl-2 text-xs italic">
                    “{cs.evidence_sentence}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** Bốn câu hỏi bắt buộc của gap + năm trường của claim — nhãn tiếng Việt cho người đọc. */
const FIELD_LABEL: Record<string, string> = {
  prior_work: 'Nghiên cứu trước đã làm được gì',
  limitation: 'Điểm nào vẫn còn hạn chế',
  why_it_matters: 'Vì sao hạn chế đó quan trọng',
  testable_experiment: 'Kiểm nghiệm bằng thí nghiệm nào',
  baseline: 'Baseline',
  metric: 'Metric',
  evidence: 'Evidence',
  refutation_condition: 'Điều kiện bác bỏ',
};

/**
 * **`CardBoard` — bảng thẻ phân rã 8 loại × 6 trạng thái.**
 *
 * Khối **bắt buộc** của đề (bước 2 + chức năng 3) mà **không mockup nào vẽ**
 * (DESIGN_SYSTEM §5.4 #1, §8 #10). Bỏ nó thì sáu `CardStatus` ở §3.2 không bao giờ xuất hiện
 * trên màn hình nào và cả §3 trở thành trang trí.
 *
 * Mobile: một cột, mỗi loại thẻ một accordion; nhóm nào còn thẻ cần chú ý thì **mở sẵn**,
 * nhóm đã `CONFIRMED` hết thì đóng — mở hay đóng tuỳ chỗ đó còn việc hay không (§6.9).
 */
const NEEDS_ATTENTION: CardStatus[] = ['MISSING', 'AMBIGUOUS', 'CONFLICT', 'UNSUPPORTED'];

export function CardBoard({ cards }: { cards: ApiCard[] }) {
  // Bộ lọc ở `useUiStore` chứ không ở `useState`: `CardBoard` unmount mỗi lần đổi bước trên
  // stepper, để local thì lọc xong đi xem bước khác rồi quay lại là mất bộ lọc (§6.9).
  const filter = useUiStore((s) => s.cardFilter);
  const setFilter = useUiStore((s) => s.setCardFilter);
  const shown = filter === 'ALL' ? cards : cards.filter((c) => c.status === filter);

  const groups = CARD_TYPES.map((type) => ({
    type,
    items: shown.filter((c) => c.type === type),
    all: cards.filter((c) => c.type === type),
  })).filter((g) => (filter === 'ALL' ? g.all.length > 0 : g.items.length > 0));

  const activeKeys = groups.map((g) => g.type);
  const openByDefault =
    filter === 'ALL'
      ? groups
          .filter((g) => g.all.some((c) => NEEDS_ATTENTION.includes(c.status)))
          .map((g) => g.type)
      : activeKeys;

  const counts = CARD_STATUSES.map((s) => ({
    status: s,
    n: cards.filter((c) => c.status === s).length,
  }));

  return (
    <div className="space-y-3">
      {/* Lọc nhanh theo trạng thái — sáu giá trị luôn hiện đủ nhãn chữ, kể cả ở 375px. */}
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant={filter === 'ALL' ? 'default' : 'outline'}
          onClick={() => setFilter('ALL')}
        >
          Tất cả ({cards.length})
        </Button>
        {counts.map(({ status, n }) => (
          <Button
            key={status}
            size="sm"
            variant={filter === status ? 'default' : 'outline'}
            disabled={n === 0}
            onClick={() => setFilter(status)}
          >
            {CARD_STATUS_STYLE[status].label} ({n})
          </Button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="border-hairline bg-surface rounded-lg border p-4 text-center">
          <p className="text-ink-3 text-xs">Không có thẻ nào khớp bộ lọc.</p>
        </div>
      ) : (
        <Accordion
          key={filter}
          type="multiple"
          defaultValue={openByDefault}
          className="space-y-2"
        >
          {groups.map((g) => (
            <AccordionItem
              key={g.type}
              value={g.type}
              className="border-hairline bg-surface rounded-lg border px-3"
            >
              <AccordionTrigger className="py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-ink-1 font-medium">{CARD_TYPE_LABEL[g.type]}</span>
                  <span className="text-ink-3 text-xs">({g.items.length})</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pb-3">
                {g.items.map((c) => (
                  <SpecCard key={c.id} card={c} />
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
