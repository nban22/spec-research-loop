'use client';

import { useMemo, useState } from 'react';
import { CredibilityTag } from '@/components/credibility-tag';
import { HintBox } from '@/components/hint-box';
import { SupportTag } from '@/components/support-tag';
import {
  VERIFIER_FLAG_LABEL,
  VERIFIER_LAYER_LABEL,
  VERIFIER_LAYER_ORDER,
} from '@/lib/status-style';
import type { SupportLabel } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { ApiEvidencePair, ApiEvidenceTrace } from '@/lib/use-project';

/**
 * Trang "vì sao nhãn này" (#5) — phần vẽ.
 *
 * Không phải màn debug. Đây là câu trả lời cho câu chắc chắn bị hỏi khi vấn đáp: *"làm sao tin
 * nhãn này đúng?"*. Mỗi cặp mở ra được **đường đi qua các tầng**, và mọi con số hiện ra đều kèm
 * ngưỡng của **chính lần chạy đó** — đọc từ `VerifierRun.config`, không phải hằng số hiện tại.
 *
 * Tách khỏi `page.tsx` để test được mà không cần mạng, đúng khuôn bốn màn hình đọc của làn C.
 */

const LABEL_FILTERS: { key: SupportLabel | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'SUPPORTED', label: 'Có nguồn hỗ trợ' },
  { key: 'WEAK', label: 'Yếu' },
  { key: 'UNSUPPORTED', label: 'Không hỗ trợ' },
];

export function EvidenceTraceView({ data }: { data: ApiEvidenceTrace }) {
  const [label, setLabel] = useState<SupportLabel | 'ALL'>('ALL');
  const [flag, setFlag] = useState<string | 'ALL'>('ALL');
  const [open, setOpen] = useState<string | null>(null);

  const flagsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const p of data.pairs) for (const f of p.flags) set.add(f);
    return [...set].sort();
  }, [data.pairs]);

  const pairs = data.pairs.filter((p) => {
    if (label !== 'ALL' && p.support_label !== label) return false;
    if (flag !== 'ALL' && !p.flags.includes(flag as never)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {LABEL_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            active={label === f.key}
            label={f.label}
            onClick={() => setLabel(f.key)}
          />
        ))}
      </div>

      {flagsPresent.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={flag === 'ALL'}
            label="Mọi cờ chẩn đoán"
            onClick={() => setFlag('ALL')}
          />
          {flagsPresent.map((f) => (
            <FilterChip
              key={f}
              active={flag === f}
              label={VERIFIER_FLAG_LABEL[f] ?? f}
              onClick={() => setFlag(f)}
            />
          ))}
        </div>
      )}

      {pairs.length === 0 ? (
        <HintBox tone="info" title="Không có cặp nào khớp bộ lọc">
          <p>Bỏ bớt bộ lọc ở trên để xem lại toàn bộ danh sách.</p>
        </HintBox>
      ) : (
        <ul className="space-y-2">
          {pairs.map((p) => (
            <li key={p.card_source_id}>
              <PairRow
                pair={p}
                thresholds={data.thresholds}
                open={open === p.card_source_id}
                onToggle={() =>
                  setOpen(open === p.card_source_id ? null : p.card_source_id)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border px-2.5 py-1 text-xs',
        'ease-out-quart transition-[color,background-color,border-color] duration-150',
        active
          ? 'border-brand-line bg-brand-soft text-brand-strong font-medium'
          : 'border-hairline bg-surface text-ink-2 hover:bg-sunken',
      )}
    >
      {label}
    </button>
  );
}

function PairRow({
  pair,
  thresholds,
  open,
  onToggle,
}: {
  pair: ApiEvidencePair;
  thresholds: ApiEvidenceTrace['thresholds'];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-hairline bg-surface rounded-md border">
      {/* Nút thật, không phải div onClick (frontend/CLAUDE.md §7). */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-sunken flex w-full cursor-pointer flex-col gap-1.5 rounded-md p-3 text-left"
      >
        <span className="flex flex-wrap items-center gap-2">
          <SupportTag label={pair.support_label} />
          <span className="text-ink-1 text-sm font-medium">
            {pair.card.title}
          </span>
        </span>
        <span className="text-ink-3 text-xs">
          {pair.source.title}
          {pair.source.year ? ` (${pair.source.year})` : ''}
        </span>
        {pair.credibility && (
          <CredibilityTag
            tier={pair.credibility.tier}
            reason={pair.credibility.reason}
          />
        )}
      </button>

      {open && (
        <div className="border-hairline space-y-3 border-t p-3">
          <LayerBar layer={pair.layer} />
          <p className="text-ink-2 text-sm">{pair.layer_why}</p>

          <dl className="grid gap-x-4 gap-y-1 text-xs md:grid-cols-2">
            <Metric
              label="Độ tương đồng"
              value={pair.similarity === null ? '—' : pair.similarity.toFixed(3)}
              note={`ngưỡng dưới ${thresholds.tau_low} · ngưỡng trên ${thresholds.tau_high}`}
            />
            <Metric
              label="Phán quyết của mô hình"
              value={pair.entailment ?? 'không gọi tới mô hình'}
              note={
                pair.confidence === null
                  ? 'không có độ chắc chắn'
                  : `độ chắc chắn ${pair.confidence.toFixed(2)} · tối thiểu ${thresholds.conf_min}`
              }
            />
          </dl>

          {pair.evidence_sentence && (
            <div>
              <p className="text-ink-4 text-2xs tracking-wide uppercase">
                Câu được trích làm bằng chứng
              </p>
              <p className="text-ink-1 mt-1 text-sm leading-relaxed italic">
                “{pair.evidence_sentence}”
              </p>
            </div>
          )}

          {pair.flags.length > 0 && (
            <ul className="text-ink-3 space-y-0.5 text-xs">
              {pair.flags.map((f) => (
                <li key={f}>· {VERIFIER_FLAG_LABEL[f] ?? f}</li>
              ))}
            </ul>
          )}

          {pair.passages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-ink-4 text-2xs tracking-wide uppercase">
                Các đoạn toàn văn đã gửi cho mô hình
              </p>
              {pair.passages.map((ps) => (
                <p
                  key={ps.rank}
                  className={cn(
                    'rounded-sm border p-2 text-xs leading-relaxed',
                    ps.is_evidence
                      ? 'border-ok-line bg-ok-soft text-ok-strong'
                      : 'border-hairline bg-sunken text-ink-2',
                  )}
                >
                  <span className="text-ink-4">
                    #{ps.rank + 1} · tương đồng {ps.similarity.toFixed(3)} · vị trí{' '}
                    {ps.char_start}
                    {ps.is_evidence ? ' · đoạn chứa câu trích' : ''}
                  </span>
                  <br />
                  {ps.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Thanh các tầng, tô đậm tầng đã quyết định. SVG không cần thiết ở đây — div là đủ và rẻ hơn. */
function LayerBar({ layer }: { layer: string }) {
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[520px] gap-1" aria-label="Đường đi qua các tầng">
        {VERIFIER_LAYER_ORDER.map((l) => {
          const hit = l === layer;
          return (
            <li
              key={l}
              aria-current={hit ? 'step' : undefined}
              className={cn(
                'flex-1 rounded-sm border px-2 py-1.5 text-center text-2xs',
                hit
                  ? 'border-brand-ink bg-brand-soft text-brand-strong font-bold'
                  : 'border-hairline bg-sunken text-ink-4',
              )}
            >
              <span className="block font-mono">{l}</span>
              <span className="block">{VERIFIER_LAYER_LABEL[l] ?? l}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <dt className="text-ink-4 text-2xs tracking-wide uppercase">{label}</dt>
      <dd className="text-ink-1 font-medium">{value}</dd>
      <dd className="text-ink-3">{note}</dd>
    </div>
  );
}
