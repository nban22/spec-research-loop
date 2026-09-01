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

/** The `J1`…`J5` pills — the explicit trace evidence the brief asks for. */
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
      {/* The status dot row follows SSE — it **is** the progress, no second bar needed (§5.5). */}
      <div className="mt-2 flex gap-1" aria-hidden>
        {['queued', 'running', 'done'].map((_, i) => (
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
        {state === 'failed' && <span className="text-danger-strong">Failed — this judge is skipped</span>}
        {state === 'done' && <span className="text-ok-strong">Finished scoring</span>}
        {state === 'running' && <span className="text-brand-strong">Scoring…</span>}
        {state === 'idle' && <span className="text-ink-4">Not started</span>}
      </p>
    </li>
  );
}

/**
 * Five `JudgeCard`s + the strip of text asserting their independence.
 *
 * Mobile: **horizontal scroll with snap points** — the only place horizontal scrolling is allowed
 * (§6.5). The five judges are **peers**; stacking them into five tall cards loses the "panel of
 * a committee" metaphor, which is exactly what the brief emphasises.
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
          The judges score independently and never see each other’s comments. Each one owns a
          separate aspect, so most issues are raised by a single judge — that is normal.
        </span>
      </p>
    </div>
  );
}

/**
 * The **agreement** half of feature 13. The denominator is the **number of judges that finished**,
 * not the constant 5 — a failed judge has to be stated plainly (SYSTEM_DESIGN_ANALYSIS C3 · F.7).
 *
 * `agreement` is the **highest agreement in the whole table**, not that of one group: this bar
 * sits above the entire `IssueTable`, so it must speak about the entire table.
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
          Highest agreement: {agreement}/{completed} judges
        </span>
        {failedKeys.length > 0 && (
          <span className="text-warn-strong"> ({failedKeys.join(', ')} failed)</span>
        )}
      </p>
      <div className="bg-hairline h-1.5 overflow-hidden rounded-full">
        <div className="bg-brand-ink h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * The **disagreement** half of feature 13 — the part no mockup draws and the easiest to forget
 * (DESIGN_SYSTEM §5.3, §8). Disagreement is **information to weigh**, not an error ⇒ it uses the
 * `neutral` family, not `warn`.
 *
 * Two rules govern the wording here:
 *
 * 1. The denominator is `judges_completed`, **not** the constant 5 — with one judge failed it is
 *    4, and the "Judge" column right next to it already shows `agreement_count/judges_completed`;
 *    two numbers in the same row must not disagree.
 * 2. It must **never** imply "the other judges looked and were fine with it". The five judges own
 *    five disjoint aspects and the prompts forbid straying (`prompts/judge_*.md`, the `## USER`
 *    block), so `1/n` is the *normal* state. Saying otherwise pushes the user to doubt precisely
 *    the judge with authority here.
 */
export function DisagreementNote({ group }: { group: ApiIssueGroup }) {
  if (group.agreement_count > 1 || group.judges_completed <= 1) return null;
  const key = group.judge_keys[0];
  const meta = key ? JUDGE_META[key] : null;
  const others = group.judges_completed - group.agreement_count;
  return (
    <p className="border-neutral-line bg-neutral-soft text-neutral-strong rounded-md border px-2.5 py-1.5 text-xs">
      Only <span className="font-medium">{key}</span>
      {meta ? ` (${meta.name} — ${meta.task.toLowerCase()})` : ''} raised this. The other {others}{' '}
      judges own different aspects of the spec, so their silence does{' '}
      <span className="font-medium">not</span> mean they looked and were satisfied.
    </p>
  );
}

/**
 * Judges write `source_id` **shortened to its first 8 characters** inside `reason` — the
 * `sources_json` sent to them carries full UUIDs, and the model truncates them in prose ("Source
 * 57eea209 reports results for…"). We resolve them back so the user can open the abstract and
 * check: most issues in a judge round are *"the abstract does not say what the card says"*, and
 * without reading the abstract nothing can be decided.
 */
const SOURCE_REF = /\b[0-9a-f]{8}\b/g;

function indexByPrefix(sources: ApiSource[]): Map<string, ApiSource> {
  const index = new Map<string, ApiSource>();
  for (const s of sources) index.set(s.id.slice(0, 8).toLowerCase(), s);
  return index;
}

/** Returns the sources we resolved **and the ids we could not** — the latter is a finding in itself. */
function referencedSources(reason: string, sources: ApiSource[]) {
  const index = indexByPrefix(sources);
  const found = new Map<string, ApiSource>();
  const missing = new Set<string>();
  for (const token of reason.match(SOURCE_REF) ?? []) {
    const hit = index.get(token.toLowerCase());
    if (hit) found.set(hit.id, hit);
    // A run of 8 plain digits (a year, a date like `20260826`) also matches the regex — require at
    // least one hex letter so those are not reported as unknown ids.
    else if (/[a-f]/.test(token)) missing.add(token);
  }
  return { found: [...found.values()], missing: [...missing] };
}

/**
 * The source chips sit **outside** the `Read more` hit area: the `line-clamp-3` paragraph is
 * already a `<button>`, so nesting chips inside would nest buttons. It reuses `SourceChip` — its
 * dialog carries the abstract, the DOI with its lookup status, and a link to the original, which
 * is exactly what checking requires.
 */
function SourceRefList({ found, missing }: { found: ApiSource[]; missing: string[] }) {
  if (found.length === 0 && missing.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-ink-4 text-2xs">Sources the judge checked against:</p>
      <div className="flex flex-wrap gap-1">
        {found.map((s) => (
          <SourceChip key={s.id} source={s} />
        ))}
        {/* An id the judge cites that the project's source store does not hold: say so plainly
            rather than print it verbatim as if it were real. */}
        {missing.map((id) => (
          <span
            key={id}
            className="border-warn-line bg-warn-soft text-warn-strong inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs"
          >
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {id} · not in the source store
          </span>
        ))}
      </div>
    </div>
  );
}

/** Inside the `Read more` dialog the links go **straight out**, never open a second dialog. */
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
              Read more
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Full reasoning</DialogTitle>
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
 * Columns: Severity · Issue · Reason · **Judge** · Action. Sorted by descending severity.
 * Below `md` it switches to a card list, keeping the same order (§6.5).
 */
export function IssueTable({
  groups,
  sources,
  onPick,
  activeId,
}: {
  groups: ApiIssueGroup[];
  /** The project's source store — used to resolve the shortened `source_id` judges write in `reason`. */
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
              <TableHead className="w-24">Severity</TableHead>
              <TableHead className="whitespace-normal">Issue</TableHead>
              <TableHead className="whitespace-normal">Reason</TableHead>
              <TableHead className="w-16 text-center">Judge</TableHead>
              <TableHead className="w-16 text-center">Action</TableHead>
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
                    Resolve
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
                Resolve
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
