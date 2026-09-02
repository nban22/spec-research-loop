"use client";

import { Scale } from "lucide-react";
import { HintBox } from "@/components/hint-box";
import { Panel } from "@/components/panel";
import { EmptyState } from "@/components/states";
import { JUDGE_META, type JudgeKey } from "@/lib/types";
import {
  MIN_UNION,
  useJudgeAgreement,
  type ApiAgreement,
  type ApiJaccardCell,
  type KappaReason,
} from "@/lib/use-judge-agreement";
import { cn } from "@/lib/utils";

/**
 * **B3 · Disagreement between judges** (#9) — the *disagreement* half of feature 13.
 *
 * The whole panel is **information to weigh**, not an error ⇒ the `neutral` colour family, not
 * `warn` (`judge.tsx` already settled this rule for `DisagreementNote`).
 *
 * The matrix is drawn with a CSS grid of `<div>`s, no charting library — the project has no
 * recharts/d3 and `STACK.md` §5 limits new installs. Cell heat uses a discrete scale over existing
 * tokens: no hex, no `style={{color}}` (frontend/CLAUDE.md §4).
 */
export function JudgeAgreementPanel({
  versionId,
}: {
  versionId: string | undefined;
}) {
  const { data, isLoading } = useJudgeAgreement(versionId);
  const a = data?.agreement ?? null;

  return (
    <Panel accent="neutral" icon={Scale} title="Disagreement between judges">
      {isLoading ? (
        <p className="text-ink-3 text-xs">Loading the metrics…</p>
      ) : !a ? (
        <EmptyState
          icon={Scale}
          tone="neutral"
          title="No metrics yet"
          description="Run the judge panel above. The metrics are frozen at run time and never recomputed, so opening this screen twice always gives the same number."
        />
      ) : (
        <>
          <KappaHeadline a={a} />
          <JaccardGrid a={a} />
          <Patterns a={a} />
        </>
      )}
    </Panel>
  );
}

const pct = (v: number | null) =>
  v === null ? "—" : `${Math.round(v * 100)}%`;

function KappaHeadline({ a }: { a: ApiAgreement }) {
  const k = a.kappa;
  return (
    <div className="space-y-2">
      <div className="border-hairline bg-sunken rounded-md border px-2.5 py-2">
        <p className="text-ink-3 text-2xs font-medium tracking-wide uppercase">
          Overlap coefficient (Fleiss κ) · round {a.round}
        </p>
        <p className="text-ink-1 text-lg font-semibold tabular-nums">
          {k.kappa === null ? "—" : k.kappa.toFixed(3)}
          <span className="text-ink-3 ml-2 text-xs font-normal">
            {k.raters} judges · {k.items} cards
          </span>
        </p>
      </div>

      {/* This number is very easy to misread, so the explanation is not decoration. */}
      <HintBox tone="info" title="How to read this number">
        The five judges run <span className="font-medium">five different prompts</span>{" "}
        and are forbidden from straying into each other’s territory, so this is{" "}
        <span className="font-medium">not</span> &ldquo;reliability&rdquo; in the
        sense of five people grading the same paper. It measures{" "}
        <span className="font-medium">overlap</span>: a low κ means the five roles
        are each doing their own job; a high κ means you are paying for five judges
        and getting one.
      </HintBox>

      {k.kappa === null && (
        <HintBox tone="warn">
          {k.reason ? REASON_TEXT[k.reason] : "No cards to measure yet."}
        </HintBox>
      )}

      {k.degenerate === "IDENTICAL_ROWS" && (
        <HintBox tone="warn">
          Every card has the same vote distribution, so the coefficient is exactly{" "}
          <span className="tabular-nums">
            {(-1 / (k.raters - 1)).toFixed(2)}
          </span>{" "}
          regardless of how the judges scored —{" "}
          <span className="font-medium">there is no overlap structure</span>{" "}
          to read here.
        </HintBox>
      )}

      {a.coverage !== null && a.coverage < 1 && (
        <p className="text-ink-3 text-xs">
          {pct(a.coverage)} of issues are attached to a card. The rest fall outside
          the measurement — and that ratio is itself judge behaviour.
        </p>
      )}
    </div>
  );
}

/**
 * The explanation for each reason κ could not be computed.
 *
 * It is a `Record<KappaReason, string>` **on purpose**, not a `? :` chain. An earlier version used
 * a three-branch chain with a bare `else`, so `MALFORMED_COUNTS` — a reason the backend does emit —
 * fell into the last branch and rendered "No cards to measure yet": false, and hiding exactly the
 * data-integrity problem most in need of being seen. With a `Record`, adding a value to
 * `KappaReason` without writing its explanation **does not compile** — a hand copy across two
 * packages cannot guard itself, so the consumer has to guard it.
 */
const REASON_TEXT: Record<KappaReason, string> = {
  NO_VARIANCE:
    "Every judge gave the same label on every card, so the coefficient is undefined. That is perfect agreement, not an error.",
  INSUFFICIENT_ITEMS:
    "There is only one card, so the coefficient comes out a constant regardless of the data — it carries no information.",
  INSUFFICIENT_RATERS: "Fewer than two judges finished, so there is nothing to compare.",
  NO_ITEMS: "No cards to measure yet.",
  MALFORMED_COUNTS:
    "The label counts are malformed, so the measurement stopped — this is a data error, not a result. Re-run the judge round or recompute.",
};

/**
 * A discrete heat scale over existing tokens. No colour interpolation, no hex.
 *
 * The diagonal (`self`) **does not go through this scale**: it compares a judge with itself, so it
 * is 1.00 by definition and carries no information. An earlier version still painted it the
 * darkest step, so when J1 and J2 genuinely overlapped the screen showed a dark 2×2 block and the
 * reader could not tell which cell meant anything — while for J3/J4 the diagonal was **dimmed**
 * merely because those two raised fewer groups than `MIN_UNION`. The same meaningless cell drawn
 * in two different colours depending on the data: the colour channel gets noisy exactly where it
 * needs to be clean.
 */
function cellClass(cell: ApiJaccardCell, self = false): string {
  if (self) return "bg-canvas text-ink-4";
  if (cell.value === null) return "bg-canvas text-ink-4";
  if (cell.union < MIN_UNION) return "bg-sunken text-ink-4";
  if (cell.value >= 0.75) return "bg-brand-ink text-white";
  if (cell.value >= 0.5) return "bg-brand-line text-ink-1";
  if (cell.value >= 0.25) return "bg-brand-soft text-ink-1";
  return "bg-sunken text-ink-2";
}

function JaccardGrid({ a }: { a: ApiAgreement }) {
  const keys = a.raters;
  if (keys.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-ink-2 text-xs font-medium">Pairwise overlap</p>
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5 text-2xs"
          style={{
            gridTemplateColumns: `2.5rem repeat(${keys.length}, minmax(2.75rem, 1fr))`,
          }}
        >
          <div />
          {keys.map((k) => (
            <div
              key={`head-${k}`}
              className="text-ink-3 pb-0.5 text-center font-semibold"
            >
              {k}
            </div>
          ))}
          {keys.map((row) => (
            <div key={`row-${row}`} className="contents">
              <div
                className="text-ink-3 flex items-center font-semibold"
                title={JUDGE_META[row as JudgeKey]?.name}
              >
                {row}
              </div>
              {keys.map((col) => {
                const cell = a.matrix[row]?.[col] ?? { value: null, union: 0 };
                const self = row === col;
                return (
                  <div
                    key={`${row}-${col}`}
                    className={cn(
                      "border-hairline flex flex-col items-center justify-center rounded-sm border py-1 tabular-nums",
                      cellClass(cell, self),
                    )}
                  >
                    {/* The number must be in the cell, not only in the title (DESIGN_SYSTEM §6.7). */}
                    <span className="font-semibold">
                      {self || cell.value === null
                        ? "—"
                        : cell.value.toFixed(2)}
                    </span>
                    {!self && (
                      <span className="opacity-70">n={cell.union}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-ink-3 text-xs">
        The share of issue groups <span className="font-medium">both</span> judges
        raised, over the groups <span className="font-medium">at least one</span>{" "}
        raised. <span className="tabular-nums">n</span> is the sample size; cells with{" "}
        <span className="tabular-nums">n&nbsp;&lt;&nbsp;{MIN_UNION}</span> are
        dimmed, because two judges raising a handful of issues each can overlap
        completely by chance.
      </p>
    </div>
  );
}

function Patterns({ a }: { a: ApiAgreement }) {
  const topPair = (() => {
    let best: { pair: string; value: number; union: number } | null = null;
    for (const row of a.raters) {
      for (const col of a.raters) {
        if (row >= col) continue;
        const c = a.matrix[row]?.[col];
        if (!c || c.value === null || c.union < MIN_UNION) continue;
        if (!best || c.value > best.value) {
          best = { pair: `${row} + ${col}`, value: c.value, union: c.union };
        }
      }
    }
    return best;
  })();

  const loner = a.solo.find((s) => s.rate !== null && s.rate > 0) ?? null;

  // The two rows below **accuse a specific judge**, so they go through a permutation null test.
  //
  // Without it both always find someone: the maximum of five real numbers is almost surely
  // positive. Measured under a null where the five judges are statistically identical, "most
  // disruptive" fired on **100%** of draws and "harshest scorer" on **98.2%**. The panel would
  // then always name a culprit, and #8 would pour expensive resources at them even when nobody
  // deserves to be named.
  //
  // `draws === 0` is a record stored **before** the test existed ⇒ *not tested*, which is very
  // different from *tested and not significant*. Neither names anyone, but they say different things.
  const nt = a.nullTest;
  const untested = nt.draws === 0;
  const harsh = nt.harsh?.significant ? nt.harsh : null;
  const disruptive = nt.disruptive?.significant ? nt.disruptive : null;

  /** Why this row names nobody. */
  const why = (v: { p: number } | null | undefined) =>
    untested
      ? "not tested"
      : v
        ? `not significant (p = ${v.p.toFixed(3)})`
        : "none";

  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-ink-2 text-xs font-medium">Worth noting</p>
      <ul className="border-hairline divide-hairline divide-y rounded-md border">
        <Row
          label="Most overlapping pair"
          value={
            topPair
              ? `${topPair.pair} — ${pct(topPair.value)} (n=${topPair.union})`
              : "sample too small"
          }
          hint="High overlap can mean one of the two judges is redundant. But J1/J3/J5 use a different model from J2/J4, so high overlap inside the same model family may be a model effect rather than a role effect."
        />
        <Row
          label="Most often alone"
          value={
            loner
              ? `${loner.judgeKey} — ${pct(loner.rate)} (${loner.solo}/${loner.raised} groups)`
              : "none"
          }
          hint="Computed as a rate over the groups that judge raised, not a raw count — otherwise whichever judge raises the most always tops the list."
        />
        <Row
          label="Harshest scorer"
          value={
            harsh
              ? `${harsh.judgeKey} — +${harsh.value.toFixed(2)} severity steps (p = ${harsh.p.toFixed(3)})`
              : why(nt.harsh)
          }
          hint="The severity offset against the other judges who raised the same group. Positive means harsher. A name only appears at p < 0.05 under a permutation null over judge labels — otherwise the maximum of five numbers is always positive and this row always accuses somebody."
        />
        <Row
          label="Most disruptive"
          value={
            disruptive
              ? `${disruptive.judgeKey} — removing them raises κ by ${disruptive.value.toFixed(3)} (p = ${disruptive.p.toFixed(3)})`
              : why(nt.disruptive)
          }
          hint="Each judge is dropped in turn and the coefficient recomputed. This is the number B2 (#8) uses to pick which judge needs self-consistency runs — instead of enabling it for all five. A name only appears at p < 0.05: a small positive Δκ is normal even when the five judges are identical."
        />
        <Row
          label="Groups the whole panel raised"
          value={`${a.unanimousGroups} groups (out of ${a.kappa.raters} judges)`}
          hint="What the whole panel points at is worth fixing first. This number is a lower bound, because rule-based grouping can miss differently worded duplicates."
        />
      </ul>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <li className="px-2.5 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-ink-2 text-xs">{label}</span>
        <span className="text-ink-1 text-xs font-semibold tabular-nums">
          {value}
        </span>
      </div>
      <p className="text-ink-3 mt-0.5 text-xs">{hint}</p>
    </li>
  );
}
