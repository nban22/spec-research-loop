'use client';

import { CircleCheck, CircleX, Loader2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { JUDGE_META, type ApiIssueGroup, type JudgeKey } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SeverityBadge } from './severity-badge';

export type JudgeState = 'idle' | 'running' | 'done' | 'failed';

/** Pill `J1`…`J5` — bằng chứng trace mà đề yêu cầu tường minh. */
export function JudgeTracePill({ keys }: { keys: JudgeKey[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {keys.map((k) => (
        <span
          key={k}
          className="border-brand-line bg-brand-soft text-brand-strong rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
          title={JUDGE_META[k].name}
        >
          {k}
        </span>
      ))}
    </span>
  );
}

function JudgeCard({ judgeKey, state }: { judgeKey: JudgeKey; state: JudgeState }) {
  const meta = JUDGE_META[judgeKey];
  return (
    <li
      className={cn(
        'bg-surface w-56 shrink-0 snap-start rounded-lg border p-3 md:w-auto',
        state === 'done' && 'border-ok-line',
        state === 'failed' && 'border-danger-line',
        state === 'running' && 'border-brand-line',
        state === 'idle' && 'border-hairline',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-ink-3 shrink-0 text-xs font-semibold">{judgeKey}</span>
        <span className="text-ink-1 min-w-0 flex-1 break-words text-sm font-medium leading-tight">
          {meta.name}
        </span>
        {state === 'running' && (
          <Loader2 className="text-brand-ink size-4 shrink-0 animate-spin" aria-hidden />
        )}
        {state === 'done' && <CircleCheck className="text-ok-ink size-4 shrink-0" aria-hidden />}
        {state === 'failed' && <CircleX className="text-danger-ink size-4 shrink-0" aria-hidden />}
      </div>
      {/* Dãy chấm trạng thái bám SSE — chính nó **là** tiến độ, không cần thanh thứ hai (§5.5). */}
      <div className="mt-2 flex gap-1" aria-hidden>
        {['chờ', 'chạy', 'xong'].map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full',
              state === 'done' && 'bg-ok-ink',
              state === 'failed' && (i === 0 ? 'bg-danger-ink' : 'bg-danger-soft'),
              state === 'running' && (i <= 1 ? 'bg-brand-ink' : 'bg-hairline'),
              state === 'idle' && 'bg-hairline',
            )}
          />
        ))}
      </div>
      <p className="text-ink-3 mt-1.5 text-xs leading-snug">{meta.task}</p>
      <p className="mt-1 text-xs">
        {state === 'failed' && <span className="text-danger-strong">Lỗi — bỏ qua judge này</span>}
        {state === 'done' && <span className="text-ok-strong">Đã chấm xong</span>}
        {state === 'running' && <span className="text-brand-strong">Đang chấm…</span>}
        {state === 'idle' && <span className="text-ink-4">Chưa chạy</span>}
      </p>
    </li>
  );
}

/**
 * Năm `JudgeCard` + dải chữ khẳng định tính độc lập.
 *
 * Mobile: **cuộn ngang có điểm dừng** — ngoại lệ duy nhất được cuộn ngang (§6.5).
 * Năm judge là các phần tử **ngang hàng nhau**; xếp dọc thành năm thẻ cao là mất ẩn dụ
 * "panel hội đồng", mà đó chính là điều đề bài nhấn mạnh.
 */
export function JudgePanel({ states }: { states: Record<JudgeKey, JudgeState> }) {
  const keys: JudgeKey[] = ['J1', 'J2', 'J3', 'J4', 'J5'];
  return (
    <div className="space-y-2">
      <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible xl:grid-cols-5">
        {keys.map((k) => (
          <JudgeCard key={k} judgeKey={k} state={states[k]} />
        ))}
      </ul>
      <p className="text-ink-3 bg-sunken flex items-center gap-2 rounded-md px-3 py-2 text-xs">
        <Scale className="size-3.5 shrink-0" aria-hidden />
        Các Judge đánh giá độc lập, không xem nhận xét của nhau.
      </p>
    </div>
  );
}

/**
 * Nửa **đồng thuận** của chức năng 13. Mẫu số là **số judge chạy xong**, không phải hằng số 5 —
 * judge lỗi phải nói thẳng ra (SYSTEM_DESIGN_ANALYSIS C3 · F.7).
 */
export function ConsensusMeter({
  agreement,
  completed,
  failedKeys,
}: {
  agreement: number;
  completed: number;
  failedKeys: JudgeKey[];
}) {
  const pct = completed > 0 ? (agreement / completed) * 100 : 0;
  return (
    <div className="space-y-1">
      <p className="text-ink-2 text-xs">
        <span className="text-ink-1 font-semibold">
          {agreement}/{completed} judge đồng ý
        </span>
        {failedKeys.length > 0 && (
          <span className="text-warn-strong"> ({failedKeys.join(', ')} lỗi)</span>
        )}
      </p>
      <div className="bg-hairline h-1.5 overflow-hidden rounded-full">
        <div className="bg-brand-ink h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Nửa **bất đồng** của chức năng 13 — phần mockup không vẽ và dễ quên nhất
 * (DESIGN_SYSTEM §5.3, §8). Bất đồng là **thông tin để cân nhắc**, không phải lỗi ⇒ dùng họ
 * `neutral`, không dùng `warn`.
 */
export function DisagreementNote({ group }: { group: ApiIssueGroup }) {
  if (group.agreement_count > 1 || group.judges_completed <= 1) return null;
  const keys = group.judge_keys;
  return (
    <p className="border-neutral-line bg-neutral-soft text-neutral-strong rounded-md border px-2.5 py-1.5 text-xs">
      Ý kiến thiểu số: chỉ {keys.join(', ')} nêu vấn đề này, {5 - keys.length} judge còn lại không nhắc tới. Cân nhắc trước khi sửa.
    </p>
  );
}

function ReasonCell({ reason }: { reason: string }) {
  if (!reason || reason.length < 150) {
    return <span>{reason}</span>;
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-left text-ink-2 hover:text-ink-1 transition-colors w-full focus:outline-none cursor-pointer">
          <span className="line-clamp-3">{reason}</span>
          <span className="text-brand-strong text-[10px] font-medium uppercase tracking-wider mt-1 inline-block hover:underline">
            Đọc thêm
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lý do chi tiết</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-ink-2 leading-relaxed whitespace-pre-wrap mt-2">
          {reason}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cột: Severity · Vấn đề · Lý do · **Judge** · Thao tác. Sắp theo severity giảm dần.
 * Dưới `md` đổi sang card list, giữ nguyên thứ tự (§6.5).
 */
export function IssueTable({
  groups,
  onPick,
  activeId,
}: {
  groups: ApiIssueGroup[];
  onPick: (g: ApiIssueGroup) => void;
  activeId?: string | null;
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Mức độ</TableHead>
              <TableHead className="whitespace-normal">Vấn đề</TableHead>
              <TableHead className="whitespace-normal">Lý do</TableHead>
              <TableHead className="w-16 text-center">Judge</TableHead>
              <TableHead className="w-16 text-center">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.id} className={cn(activeId === g.id && 'bg-decide-soft')}>
                <TableCell className="align-top">
                  <SeverityBadge severity={g.max_severity} />
                </TableCell>
                <TableCell className="text-ink-1 align-top text-xs font-medium whitespace-normal">
                  {g.canonical_title}
                  <DisagreementNote group={g} />
                </TableCell>
                <TableCell className="text-ink-2 align-top text-xs whitespace-normal">
                  <ReasonCell reason={g.issues[0]?.reason ?? ''} />
                </TableCell>
                <TableCell className="align-top text-center">
                  <JudgeTracePill keys={g.judge_keys} />
                  <p className="text-ink-3 mt-1 text-[11px]">
                    {g.agreement_count}/{g.judges_completed}
                  </p>
                </TableCell>
                <TableCell className="align-top text-center">
                  <Button size="sm" variant="outline" onClick={() => onPick(g)}>
                    Xử lý
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {groups.map((g) => (
          <li
            key={g.id}
            className={cn(
              'space-y-2 rounded-lg border p-3',
              activeId === g.id ? 'border-decide-ink bg-decide-soft' : 'border-hairline bg-surface',
            )}
          >
            <div className="flex items-start gap-2">
              <SeverityBadge severity={g.max_severity} />
              <p className="text-ink-1 min-w-0 flex-1 text-sm font-medium">
                {g.canonical_title}
              </p>
            </div>
            <p className="text-ink-2 text-xs">{g.issues[0]?.reason}</p>
            <DisagreementNote group={g} />
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <JudgeTracePill keys={g.judge_keys} />
                <span className="text-ink-3 text-[11px]">
                  {g.agreement_count}/{g.judges_completed}
                </span>
              </span>
              <Button size="sm" variant="outline" onClick={() => onPick(g)}>
                Xử lý
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
