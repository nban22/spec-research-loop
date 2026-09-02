'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import type { ApiEstimate } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * **Cost simulation + the Pareto frontier** — issue #18 (lane C).
 *
 * It joins two suggestions from the brief: the *cost simulator* (Step 7) and the *Pareto frontier
 * between quality and cost* (Step 6). Every number comes from the existing
 * `GET /projects/:id/estimate/preview` — **no new endpoint**, and no copy of the
 * `EstimatorService` formulas into this file. Copying them would put the two out of step the first
 * time somebody edits a unit price.
 *
 * This file owns the drawing; the page around it owns the API calls, so the component is testable
 * without a network.
 */

export type SimInput = {
  model_params_b: number;
  quantization: 'fp16' | 'int8' | 'int4';
  candidates: number;
  rounds: number;
  eval_samples: number;
  avg_prompt_tokens: number;
  avg_output_tokens: number;
};

/** One point on the grid: a config plus the estimate the server returned for exactly that config. */
export type GridPoint = { input: SimInput; estimate: ApiEstimate };

/** The RTX 3090 VRAM limit — this number comes **from the brief**, it is not infrastructure config. */
const RTX3090_GB = 24;

const W = 640;
const H = 360;
const PAD = { top: 18, right: 16, bottom: 34, left: 44 };

/**
 * **The quality score here is a proxy, not a measurement.**
 *
 * The system has no real quality metric for a config — getting one means running an eval, and
 * running evals is deliverable #7's business, not a simulation screen's. So the vertical axis uses
 * two things strongly correlated with quality and **known before any run**: model size and search
 * budget. `log2` because both have diminishing returns — 70B is not ten times better than 7B.
 *
 * Quantisation **must** cost points, however few. Ignoring it would rate int4 and fp16 at the same
 * model size as equal quality while int4 needs far less VRAM — so both would sit on the frontier
 * and the Pareto line would zigzag vertically at one cost level. Subtracting 0.5/1.0 `log2` steps
 * is a convention chosen to break that tie; it is not a measurement of quantisation loss.
 *
 * This number only **orders** configs, it does not predict accuracy. The resulting Pareto line
 * therefore says "no config is both cheaper and better resourced", not anything about outcomes.
 */
const QUANT_PENALTY: Record<SimInput['quantization'], number> = { fp16: 0, int8: 0.5, int4: 1 };

export function qualityProxy(input: SimInput): number {
  return (
    Math.log2(input.model_params_b) +
    Math.log2(input.candidates * input.rounds * input.eval_samples) -
    QUANT_PENALTY[input.quantization]
  );
}

/**
 * The Pareto frontier: keep the points **no other point dominates on both axes** (cheaper *and*
 * higher quality). A tie on one axis is not domination — two configs at the same price and score
 * both survive, and the user picks between them on other grounds.
 */
export function paretoFront(points: GridPoint[]): GridPoint[] {
  return points.filter((p) => {
    const cost = p.estimate.cost_usd;
    const q = qualityProxy(p.input);
    return !points.some((o) => {
      const oc = o.estimate.cost_usd;
      const oq = qualityProxy(o.input);
      return (oc <= cost && oq > q) || (oc < cost && oq >= q);
    });
  });
}

/**
 * The numbers for the selected config plus the Pareto chart.
 *
 * `current` can be `null` while a refetch is in flight — the chart stays put and only the numbers
 * dim, so dragging a slider does not make the whole screen flicker.
 */
export function ParetoChart({
  points,
  current,
  suggested,
  onPick,
}: {
  points: GridPoint[];
  current: GridPoint | null;
  /** The config the system suggests when the RTX 3090 limit is exceeded (`downscale_suggestion`), if any. */
  suggested: GridPoint | null;
  onPick: (input: SimInput) => void;
}) {
  const reduced = useReducedMotion();
  const front = useMemo(() => {
    return paretoFront(points).sort((a, b) => a.estimate.cost_usd - b.estimate.cost_usd);
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="text-ink-3 border-hairline rounded-lg border px-3 py-6 text-center text-xs">
        Building the config grid…
      </p>
    );
  }

  const costs = points.map((p) => p.estimate.cost_usd);
  const vrams = points.map((p) => p.estimate.vram_gb);
  const maxCost = Math.max(...costs, 0.0001);
  // The vertical axis always includes the 24 GB line even when every config is light — a missing
  // line reads as "it does not exist", not as "we are far below the limit".
  const maxVram = Math.max(...vrams, RTX3090_GB * 1.15);

  const px = (cost: number) =>
    PAD.left + (cost / maxCost) * (W - PAD.left - PAD.right);
  const py = (gb: number) => H - PAD.bottom - (gb / maxVram) * (H - PAD.top - PAD.bottom);

  const front3090 = py(RTX3090_GB);
  /** Changes when the **set** of frontier configs changes — the cue to cross-fade to a new line. */
  const frontKey = front.map((p) => `${p.input.model_params_b}${p.input.quantization}`).join('|');
  const key = (p: GridPoint) =>
    `${p.input.model_params_b}-${p.input.quantization}-${p.input.candidates}-${p.input.rounds}-${p.input.eval_samples}`;

  return (
    <div className="space-y-2">
      <div className="border-hairline bg-surface overflow-x-auto rounded-lg border">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={`Chart of ${points.length} configs: cost against VRAM, with the RTX 3090 24 GB line`}
        >
          {/* The over-limit region is filled first, so "over the line" reads visually, not in words. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={W - PAD.left - PAD.right}
            height={Math.max(0, front3090 - PAD.top)}
            className="fill-danger-soft"
          />
          <line
            x1={PAD.left}
            y1={front3090}
            x2={W - PAD.right}
            y2={front3090}
            className="stroke-danger-ink"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <text x={PAD.left + 6} y={front3090 - 5} className="fill-danger-strong text-[10px]">
            24 GB · RTX 3090
          </text>

          {/* Axes */}
          <line
            x1={PAD.left}
            y1={H - PAD.bottom}
            x2={W - PAD.right}
            y2={H - PAD.bottom}
            className="stroke-hairline"
          />
          <line
            x1={PAD.left}
            y1={PAD.top}
            x2={PAD.left}
            y2={H - PAD.bottom}
            className="stroke-hairline"
          />
          <text x={W - PAD.right} y={H - 10} textAnchor="end" className="fill-ink-3 text-[10px]">
            estimated cost (USD) →
          </text>
          <text
            x={10}
            y={PAD.top + 8}
            className="fill-ink-3 text-[10px]"
            transform={`rotate(-90 10 ${PAD.top + 8})`}
            textAnchor="end"
          >
            ← VRAM (GB)
          </text>

          {/* The Pareto line is drawn first so the dots sit on top of it.
              The `points` attribute cannot be tweened — the number of frontier vertices changes
              with the grid, and `motion` can only interpolate when both sides have the same count.
              So transitions are a **cross-fade**: the old line fades out, the new one fades in.
              Less faithful than sliding, but better than a line snapping to another shape in one frame. */}
          <AnimatePresence mode="wait" initial={false}>
            {front.length > 1 && (
              <motion.polyline
                key={frontKey}
                points={front
                  .map((p) => `${px(p.estimate.cost_usd)},${py(p.estimate.vram_gb)}`)
                  .join(' ')}
                className="stroke-brand-ink"
                fill="none"
                strokeWidth={1.5}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
              />
            )}
          </AnimatePresence>

          {points.map((p) => {
            const onFront = front.includes(p);
            const isCurrent = current !== null && key(current) === key(p);
            const isSuggested = suggested !== null && key(suggested) === key(p);
            const label = `${p.input.model_params_b}B ${p.input.quantization}, ${p.input.candidates} candidates × ${p.input.rounds} rounds: ${p.estimate.vram_gb} GB, $${p.estimate.cost_usd.toFixed(4)}`;
            return (
              <g
                key={key(p)}
                role="button"
                tabIndex={0}
                aria-label={`Select config ${label}`}
                aria-pressed={isCurrent}
                className="cursor-pointer"
                onClick={() => onPick(p.input)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(p.input);
                  }
                }}
              >
                {/* Dots **slide** to their new position rather than jumping. This is what makes the
                    screen work: dragging a slider moves the whole grid, and an instant jump loses
                    the point the eye was tracking along with the direction it moved. */}
                <motion.circle
                  cx={px(p.estimate.cost_usd)}
                  cy={py(p.estimate.vram_gb)}
                  animate={{
                    cx: px(p.estimate.cost_usd),
                    cy: py(p.estimate.vram_gb),
                    r: isCurrent ? 7 : isSuggested ? 6 : onFront ? 4.5 : 3,
                  }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 300, damping: 30, mass: 0.6 }
                  }
                  className={cn(
                    isCurrent
                      ? 'fill-brand-ink'
                      : isSuggested
                        ? 'fill-ok-ink'
                        : onFront
                          ? 'fill-brand-line'
                          : 'fill-neutral-line',
                  )}
                  stroke="currentColor"
                  strokeWidth={isCurrent || isSuggested ? 2 : 0.8}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="text-ink-3 text-2xs flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className="flex items-center gap-1.5">
          <span className="bg-brand-ink inline-block size-2.5 rounded-full" aria-hidden />
          selected config
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-ok-ink inline-block size-2.5 rounded-full" aria-hidden />
          system suggestion
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-brand-line inline-block size-2.5 rounded-full" aria-hidden />
          on the Pareto frontier
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-danger-soft inline-block size-2.5 rounded-sm" aria-hidden />
          over 24 GB
        </li>
      </ul>
    </div>
  );
}

/** One slider with a real `htmlFor` label (frontend/CLAUDE.md §7). */
export function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-ink-2 text-xs font-medium">
          {label}
        </label>
        <span className="text-ink-1 text-xs tabular-nums">{value.toLocaleString('en-US')}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-brand-ink h-1.5 w-full cursor-pointer"
      />
      {hint && <p className="text-ink-4 text-2xs">{hint}</p>}
    </div>
  );
}

/** The quantisation picker — three discrete values, where a slider would be the wrong control. */
export function QuantPicker({
  value,
  onChange,
}: {
  value: SimInput['quantization'];
  onChange: (v: SimInput['quantization']) => void;
}) {
  const opts: SimInput['quantization'][] = ['fp16', 'int8', 'int4'];
  return (
    <div className="space-y-1">
      <p className="text-ink-2 text-xs font-medium">Quantisation</p>
      <div className="border-hairline inline-flex rounded-md border p-0.5">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={cn(
              'ease-out-quart cursor-pointer rounded px-2.5 py-1 text-xs transition-colors duration-150',
              value === o ? 'bg-brand-soft text-brand-strong font-medium' : 'text-ink-3',
            )}
          >
            {o}
          </button>
        ))}
      </div>
      <p className="text-ink-4 text-2xs">
        int8 roughly halves the VRAM of fp16, and int4 halves it again.
      </p>
    </div>
  );
}

/** The numbers for the selected config. Dimmed during a refetch rather than replaced by a skeleton. */
export function EstimatePanel({
  estimate,
  stale,
}: {
  estimate: ApiEstimate | null;
  stale: boolean;
}) {
  if (!estimate) {
    return <p className="text-ink-3 text-xs">Calculating…</p>;
  }
  const rows = [
    { label: 'VRAM', value: `${estimate.vram_gb} GB` },
    { label: 'Estimated cost', value: `$${estimate.cost_usd.toFixed(4)}` },
    { label: 'Time', value: `${estimate.hours_min}–${estimate.hours_max} hours` },
    { label: 'Estimated tokens', value: estimate.tokens_est.toLocaleString('en-US') },
  ];

  return (
    <div className={cn('space-y-2 transition-opacity duration-150', stale && 'opacity-50')}>
      <dl className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="border-hairline bg-surface rounded-md border px-2.5 py-1.5">
            <dt className="text-ink-4 text-2xs">{r.label}</dt>
            <dd className="text-ink-1 text-sm font-medium tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p
        className={cn(
          'rounded-md border px-2.5 py-1.5 text-xs',
          estimate.fits_rtx3090
            ? 'border-ok-line bg-ok-soft text-ok-strong'
            : 'border-danger-line bg-danger-soft text-danger-strong',
        )}
      >
        {estimate.fits_rtx3090
          ? `Fits an RTX 3090 (${estimate.vram_gb}/24 GB).`
          : `Over the RTX 3090: needs ${estimate.vram_gb} GB, the card has 24 GB.`}
      </p>
    </div>
  );
}
