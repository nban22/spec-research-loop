'use client';

import { CircleCheck, CircleX, Loader2, Scale, TriangleAlert } from 'lucide-react';
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
import {
  JUDGE_META,
  type ApiIssueGroup,
  type ApiSource,
  type JudgeKey,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { SeverityBadge } from './severity-badge';
import { SourceChip } from './sources';

export type JudgeState = 'idle' | 'running' | 'done' | 'failed';

/** Pill `J1`…`J5` — bằng chứng trace mà đề yêu cầu tường minh. */
export function JudgeTracePill({ keys }: { keys: JudgeKey[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {keys.map((k) => (
        <span
          key={k}
          className="border-brand-line bg-brand-soft text-brand-strong rounded-full border px-1.5 py-0.5 text-2xs font-semibold"
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
        'ease-out-quart transition-[border-color,background-color] duration-300',
        state === 'done' && 'border-ok-line bg-ok-soft/40',
        state === 'failed' && 'border-danger-line',
        state === 'running' && 'border-brand-line',
        state === 'idle' && 'border-hairline',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-ink-3 shrink-0 text-xs font-semibold">{judgeKey}</span>
        <span className="text-ink-1 min-w-0 flex-1 wrap-break-word text-sm font-medium leading-tight">
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
      <p className="text-ink-3 bg-sunken flex items-start gap-2 rounded-md px-3 py-2 text-xs">
        <Scale className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Các Judge đánh giá độc lập, không xem nhận xét của nhau. Mỗi Judge phụ trách một khía
          cạnh riêng, nên phần lớn vấn đề chỉ do một Judge nêu — đó là bình thường.
        </span>
      </p>
    </div>
  );
}

/**
 * Nửa **đồng thuận** của chức năng 13. Mẫu số là **số judge chạy xong**, không phải hằng số 5 —
 * judge lỗi phải nói thẳng ra (SYSTEM_DESIGN_ANALYSIS C3 · F.7).
 *
 * `agreement` là mức đồng thuận **cao nhất trong cả bảng**, không phải của một nhóm cụ thể:
 * thanh này đứng trên toàn bộ `IssueTable` nên nó phải nói về toàn bộ bảng.
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
          Đồng thuận cao nhất: {agreement}/{completed} judge
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
 *
 * Hai luật của câu chữ ở đây:
 *
 * 1. Mẫu số là `judges_completed`, **không** phải hằng số 5 — một judge lỗi thì mẫu số là 4,
 *    và cột "Judge" ngay bên cạnh đã hiện `agreement_count/judges_completed` rồi; hai con số
 *    trong cùng một hàng không được nói khác nhau.
 * 2. **Không** được suy ra "các judge kia đã xem và thấy ổn". Năm judge phụ trách năm khía cạnh
 *    rời nhau và prompt cấm lấn sân (`prompts/judge_*.md`, khối `## USER`), nên `1/n` là trạng
 *    thái *bình thường*. Nói ngược lại là đẩy người dùng nghi ngờ đúng judge có thẩm quyền.
 */
export function DisagreementNote({ group }: { group: ApiIssueGroup }) {
  if (group.agreement_count > 1 || group.judges_completed <= 1) return null;
  const key = group.judge_keys[0];
  const meta = key ? JUDGE_META[key] : null;
  const others = group.judges_completed - group.agreement_count;
  return (
    <p className="border-neutral-line bg-neutral-soft text-neutral-strong rounded-md border px-2.5 py-1.5 text-xs">
      Chỉ <span className="font-medium">{key}</span>
      {meta ? ` (${meta.name} — ${meta.task.toLowerCase()})` : ''} nêu vấn đề này. {others} judge
      còn lại phụ trách khía cạnh khác của spec, nên việc họ không nhắc tới{' '}
      <span className="font-medium">không</span> có nghĩa là đã xem và thấy ổn.
    </p>
  );
}

/**
 * Judge viết `source_id` **rút gọn 8 ký tự đầu** trong `reason` — `sources_json` gửi đi mang UUID
 * đầy đủ, model tự cắt khi viết văn ("Source 57eea209 reports results for…"). Tra ngược để người
 * dùng mở được abstract mà đối chiếu: phần lớn issue của một vòng judge là *"abstract không nói
 * điều card nói"*, và không đọc được abstract thì không quyết được gì.
 */
const SOURCE_REF = /\b[0-9a-f]{8}\b/g;

function indexByPrefix(sources: ApiSource[]): Map<string, ApiSource> {
  const index = new Map<string, ApiSource>();
  for (const s of sources) index.set(s.id.slice(0, 8).toLowerCase(), s);
  return index;
}

/** Trả về nguồn tra ra được, **và cả id tra không ra** — cái sau tự nó là một phát hiện. */
function referencedSources(reason: string, sources: ApiSource[]) {
  const index = indexByPrefix(sources);
  const found = new Map<string, ApiSource>();
  const missing = new Set<string>();
  for (const token of reason.match(SOURCE_REF) ?? []) {
    const hit = index.get(token.toLowerCase());
    if (hit) found.set(hit.id, hit);
    // Chuỗi 8 chữ số thuần (năm, ngày `20260826`) cũng khớp regex — đòi ít nhất một chữ cái
    // hex để không báo nhầm chúng là id lạ.
    else if (/[a-f]/.test(token)) missing.add(token);
  }
  return { found: [...found.values()], missing: [...missing] };
}

/**
 * Chip nguồn đặt **ngoài** vùng bấm của `Đọc thêm`: đoạn `line-clamp-3` đã là một `<button>`,
 * nhét chip vào trong là button lồng button. Dùng lại `SourceChip` — Dialog của nó có abstract,
 * DOI kèm trạng thái tra cứu và nút mở nguồn gốc, đúng thứ cần để đối chiếu.
 */
function SourceRefList({ found, missing }: { found: ApiSource[]; missing: string[] }) {
  if (found.length === 0 && missing.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-ink-4 text-2xs">Nguồn judge đối chiếu:</p>
      <div className="flex flex-wrap gap-1">
        {found.map((s) => (
          <SourceChip key={s.id} source={s} />
        ))}
        {/* Id judge nhắc tới mà kho nguồn của dự án không có: nói thẳng ra thay vì hiện nguyên
            văn như thể nó có thật. */}
        {missing.map((id) => (
          <span
            key={id}
            className="border-warn-line bg-warn-soft text-warn-strong inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs"
          >
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {id} · không có trong kho nguồn
          </span>
        ))}
      </div>
    </div>
  );
}

/** Trong Dialog `Đọc thêm` thì link **thẳng ra ngoài**, không mở Dialog thứ hai. */
function LinkedReason({ reason, sources }: { reason: string; sources: ApiSource[] }) {
  const index = indexByPrefix(sources);
  const parts = reason.split(SOURCE_REF);
  const tokens = reason.match(SOURCE_REF) ?? [];

  return (
    <div className="text-ink-2 mt-2 text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        const token = tokens[i];
        const hit = token ? index.get(token.toLowerCase()) : undefined;
        const href = hit?.url ?? (hit?.doi ? `https://doi.org/${hit.doi}` : null);
        return (
          <span key={i}>
            {part}
            {token &&
              (href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-strong font-mono underline underline-offset-2"
                >
                  {token}
                </a>
              ) : (
                <span className="font-mono">{token}</span>
              ))}
          </span>
        );
      })}
    </div>
  );
}

function ReasonCell({ reason, sources }: { reason: string; sources: ApiSource[] }) {
  const { found, missing } = referencedSources(reason ?? '', sources);
  const body =
    !reason || reason.length < 150 ? (
      <span>{reason}</span>
    ) : (
      <Dialog>
        <DialogTrigger asChild>
          <button className="text-ink-2 hover:text-ink-1 w-full cursor-pointer text-left transition-colors focus:outline-none">
            <span className="line-clamp-3">{reason}</span>
            <span className="text-brand-strong mt-1 inline-block text-2xs font-medium tracking-wider uppercase hover:underline">
              Đọc thêm
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lý do chi tiết</DialogTitle>
          </DialogHeader>
          <LinkedReason reason={reason} sources={sources} />
        </DialogContent>
      </Dialog>
    );

  return (
    <>
      {body}
      <SourceRefList found={found} missing={missing} />
    </>
  );
}

/**
 * Cột: Severity · Vấn đề · Lý do · **Judge** · Thao tác. Sắp theo severity giảm dần.
 * Dưới `md` đổi sang card list, giữ nguyên thứ tự (§6.5).
 */
export function IssueTable({
  groups,
  sources,
  onPick,
  activeId,
}: {
  groups: ApiIssueGroup[];
  /** Kho nguồn của dự án — để tra ngược `source_id` rút gọn mà judge viết trong `reason`. */
  sources: ApiSource[];
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
              <TableRow
                key={g.id}
                className={cn(
                  'ease-out-quart transition-colors duration-150',
                  activeId === g.id ? 'bg-decide-soft' : 'hover:bg-sunken',
                )}
              >
                <TableCell className="align-top">
                  <SeverityBadge severity={g.max_severity} />
                </TableCell>
                <TableCell className="text-ink-1 align-top text-xs font-medium whitespace-normal">
                  {g.canonical_title}
                  <DisagreementNote group={g} />
                </TableCell>
                <TableCell className="text-ink-2 align-top text-xs whitespace-normal">
                  <ReasonCell reason={g.issues[0]?.reason ?? ''} sources={sources} />
                </TableCell>
                <TableCell className="align-top text-center">
                  <JudgeTracePill keys={g.judge_keys} />
                  <p className="text-ink-3 mt-1 text-2xs tabular-nums">
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
              'ease-out-quart transition-[border-color,background-color] duration-150',
              activeId === g.id
                ? 'border-decide-ink bg-decide-soft'
                : 'border-hairline bg-surface hover:border-decide-line',
            )}
          >
            <div className="flex items-start gap-2">
              <SeverityBadge severity={g.max_severity} />
              <p className="text-ink-1 min-w-0 flex-1 text-sm font-medium">
                {g.canonical_title}
              </p>
            </div>
            <div className="text-ink-2 text-xs">
              <ReasonCell reason={g.issues[0]?.reason ?? ''} sources={sources} />
            </div>
            <DisagreementNote group={g} />
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <JudgeTracePill keys={g.judge_keys} />
                <span className="text-ink-3 text-2xs tabular-nums">
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
