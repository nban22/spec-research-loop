import {
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  Info,
  OctagonAlert,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type {
  CardStatus,
  ConfidenceLevel,
  CredibilityTier,
  Severity,
  SupportLabel,
} from './types';

/**
 * **Where §3 of DESIGN_SYSTEM turns into code.** This is the **only** file under `app/` and
 * `components/` allowed to hold raw Tailwind colour classes (§7.2), and the three components
 * `StatusChip` / `SeverityBadge` / `SupportTag` are its **only** readers (§7.1).
 *
 * Declared as `Record<Enum, …>` so a missing enum value is a **TypeScript error at build time**,
 * not a blank badge at runtime.
 *
 * Principle: **shape encodes the GROUP, colour encodes the VALUE** (§3.1).
 *   CardStatus   -> fully rounded pill, very pale fill, CIRCLE icon family
 *   Severity     -> solid block, squarest corners, UPPERCASE, POLYGON icon family
 *   SupportLabel -> hollow tag, thick border, UPPERCASE, SHIELD icon family
 */

export type StatusStyle = { label: string; icon: LucideIcon; className: string };

export const CARD_STATUS_STYLE: Record<CardStatus, StatusStyle> = {
  CONFIRMED: {
    label: 'Confirmed',
    icon: CircleCheck,
    className: 'bg-ok-soft text-ok-strong border-ok-line',
  },
  PROPOSED: {
    // White background, no fill — signals the user has not stamped it yet (§3.2).
    label: 'Proposed',
    icon: Circle,
    className: 'bg-surface text-brand-strong border-brand-line',
  },
  MISSING: {
    // The dashed border is the "empty slot" signal, readable even printed in black and white.
    label: 'Missing',
    icon: CircleDashed,
    className: 'bg-neutral-soft text-neutral-strong border-neutral-line border-dashed',
  },
  AMBIGUOUS: {
    label: 'Ambiguous',
    icon: CircleHelp,
    className: 'bg-warn-soft text-warn-strong border-warn-line',
  },
  UNSUPPORTED: {
    // An export-blocking failure (verifier gate) — has to be red.
    label: 'Unsupported',
    icon: CircleSlash,
    className: 'bg-danger-soft text-danger-strong border-danger-line',
  },
  CONFLICT: {
    // Purple = the user must arbitrate; the machine cannot pick a side on its own.
    label: 'Conflict',
    icon: CircleAlert,
    className: 'bg-decide-soft text-decide-strong border-decide-line',
  },
};

/** The colour rail on the left edge of `SpecCard` — the card is **never** filled by status (§3.7). */
export const CARD_STATUS_BAR: Record<CardStatus, string> = {
  CONFIRMED: 'bg-ok-ink',
  PROPOSED: 'bg-brand-ink',
  MISSING: 'bg-neutral-line',
  AMBIGUOUS: 'bg-warn-ink',
  UNSUPPORTED: 'bg-danger-ink',
  CONFLICT: 'bg-decide-ink',
};

export const SEVERITY_STYLE: Record<Severity, StatusStyle> = {
  CRITICAL: {
    label: 'CRITICAL',
    icon: OctagonAlert,
    className: 'bg-danger-ink text-white',
  },
  MAJOR: {
    label: 'MAJOR',
    icon: TriangleAlert,
    className: 'bg-major-ink text-white',
  },
  MINOR: {
    // [DECISION] diverges from mockup 4: white on yellow is unreadable, switched to ink text (§3.3).
    label: 'MINOR',
    icon: Info,
    className: 'bg-minor-ink text-minor-strong',
  },
};

export const SUPPORT_STYLE: Record<SupportLabel, StatusStyle> = {
  SUPPORTED: {
    label: 'SUPPORTED',
    icon: ShieldCheck,
    className: 'border-ok-ink text-ok-strong',
  },
  WEAK: {
    label: 'WEAK',
    icon: ShieldAlert,
    className: 'border-warn-ink text-warn-strong',
  },
  UNSUPPORTED: {
    label: 'UNSUPPORTED',
    icon: ShieldX,
    className: 'border-danger-ink text-danger-strong',
  },
};

/**
 * **The fourth state of a card-source pair: never verified at all.**
 *
 * Deliberately **not** added to `SupportLabel` — that enum holds the verifier's three verdicts,
 * while this one means "the verifier has not looked yet". Mixing the two into one enum makes
 * every label tally lie. The signal comes from `CardSource.verifier_run_id === null`, not from
 * a label.
 *
 * Uses `neutral`, **not** `warn`: not measured is not a bad result, it is the absence of a
 * result — the same reasoning as the note on `CONFIDENCE_STYLE` just below.
 */
export const UNVERIFIED_STYLE: StatusStyle = {
  // The dashed border borrows the "empty slot" signal of `MISSING`: readable in black and white,
  // and the only cue left when the other three `SupportLabel` tags are hollow and same-sized.
  label: 'UNVERIFIED',
  icon: ShieldQuestion,
  className: 'border-neutral-line border-dashed text-neutral-strong',
};

/**
 * The fourth enum family. Deliberately has **no** badge component of its own: the three objects
 * in §3.1 already spend all three shapes that stay distinguishable in black and white. Rendered
 * as a line inside `HintBox` (§3.8). `LOW` uses `warn`, **not** `danger` — the system being
 * unsure is not an *error*.
 */
export const CONFIDENCE_STYLE: Record<
  ConfidenceLevel,
  { label: string; tone: 'ok' | 'warn'; hint: string }
> = {
  HIGH: {
    label: 'High',
    tone: 'ok',
    hint: 'The system is confident it understood your idea.',
  },
  MEDIUM: {
    label: 'Medium',
    tone: 'warn',
    hint: 'Read the paraphrase above again and check that it says what you meant.',
  },
  LOW: {
    label: 'Low',
    tone: 'warn',
    hint: 'The system is not sure it understood you — consider rewriting the idea more concretely, then analyse again.',
  },
};

/** Verifier diagnostic flags → the explanation sentence shown next to `SupportTag`. */
export const VERIFIER_FLAG_LABEL: Record<string, string> = {
  SOURCE_NOT_FOUND: 'This source was not found in any registry',
  EMPTY_ABSTRACT: 'The source has no abstract to check against',
  STALE_SOURCE: 'The source is rather old for a “state of the art” claim',
  NUMBER_NOT_IN_SOURCE: 'The number in the claim does not appear in the abstract',
  FABRICATED_QUOTE: 'The quoted sentence is not in the abstract',
  DOI_UNVERIFIED: 'The DOI could not be checked (the registry did not answer)',
  LLM_UNAVAILABLE: 'The model check could not run at this step',
  // Lane A · #2 — the two flags of the full-text layer.
  FULLTEXT_USED: 'This label was read from the full paper, not just the abstract',
  FULLTEXT_UNAVAILABLE:
    'The full text could not be fetched — fell back to the abstract',
  // This card type asserts an absence (a gap) or an intention (a contribution), so asking
  // "does the source entail this sentence" is the wrong question. The citation is still
  // checked for existence.
  CITATION_ONLY: 'Citation checked as real; this card type is not scored by entailment',
};

/**
 * Lane A · #1 — source credibility.
 *
 * Three tiers, and **none of them uses `danger`**: a weak source is not an *error*, it is
 * something the reader has to weigh. Using `danger` here would compete with `UNSUPPORTED` — the
 * thing that actually blocks publishing.
 *
 * The score itself is never shown; what is shown is the `label` plus the `reason` sentence the
 * backend produces (the acceptance criterion of #1).
 */
export const CREDIBILITY_STYLE: Record<
  CredibilityTier,
  { label: string; className: string }
> = {
  HIGH: {
    label: 'Trusted',
    className: 'bg-ok-soft text-ok-strong border-ok-line',
  },
  MEDIUM: {
    label: 'Medium',
    className: 'bg-neutral-soft text-neutral-strong border-neutral-line',
  },
  REVIEW: {
    label: 'Needs review',
    className: 'bg-warn-soft text-warn-strong border-warn-line',
  },
};

/** Lane A · #3 — labels for the two conflict scopes and the four detection signals. */
export const CONFLICT_SCOPE_LABEL: Record<string, string> = {
  INTRA_CARD: 'Two sources on the same card contradict each other',
  CROSS_CARD: 'Two cards use the same paper in opposite directions',
};

export const CONFLICT_SIGNAL_LABEL: Record<string, string> = {
  POLARITY: 'Opposite conclusions',
  NUMERIC: 'Numbers disagree',
  DIRECTION: 'Opposite phrasing',
  LLM: 'Confirmed by the model',
};

/** Lane A · #5 — the names of the verifier's seven layers, shown on the trace bar. */
export const VERIFIER_LAYER_LABEL: Record<string, string> = {
  L0: 'Source is real',
  L1: 'Enough data',
  L2: 'Number check',
  L3: 'Similarity',
  L3b: 'Full-text read',
  L4: 'Ask the model',
  L4b: 'Quote-fabrication guard',
};

/** Display order of the layer bar — also the real execution order inside the verifier. */
export const VERIFIER_LAYER_ORDER = [
  'L0',
  'L1',
  'L2',
  'L3',
  'L3b',
  'L4',
  'L4b',
] as const;
