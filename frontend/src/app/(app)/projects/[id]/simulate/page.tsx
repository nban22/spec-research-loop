'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { Gauge, SlidersHorizontal, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import {
  EstimatePanel,
  ParetoChart,
  QuantPicker,
  SliderRow,
  type GridPoint,
  type SimInput,
} from '@/components/cost-simulator';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { api, qk } from '@/lib/api';
import type { ApiEstimate } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';

/**
 * **Cost simulation and the Pareto frontier** — issue #18 (lane C).
 *
 * Every number comes from the existing `GET /projects/:id/estimate/preview`. **No new endpoint**,
 * and no copy of the `EstimatorService` formulas into the frontend — a copy drifts the first time
 * somebody edits a unit price, and nobody would notice because both sides would "look right".
 *
 * The cost: one call per configuration. Acceptable because this endpoint is a **pure function with
 * zero I/O**, and TanStack Query caches per configuration with `staleTime: Infinity` — the result
 * of a pure function never goes stale, so dragging a slider back and forth only hits the network once.
 */

/** The grid ladders. Model sizes follow the real-world sizes, not an evenly spaced series. */
const MODEL_LADDER = [7, 13, 32, 70];
const QUANT_LADDER: SimInput['quantization'][] = ['fp16', 'int8', 'int4'];
/** Search budget: cost **only** varies with this group, so without it the grid collapses to one column. */
const BUDGET_LADDER = [
  { candidates: 4, rounds: 2 },
  { candidates: 8, rounds: 3 },
  { candidates: 16, rounds: 4 },
];

const DEFAULTS: SimInput = {
  model_params_b: 13,
  quantization: 'fp16',
  candidates: 8,
  rounds: 3,
  eval_samples: 200,
  avg_prompt_tokens: 1200,
  avg_output_tokens: 600,
};

function toQuery(input: SimInput): string {
  return new URLSearchParams({
    model_params_b: String(input.model_params_b),
    quantization: input.quantization,
    candidates: String(input.candidates),
    rounds: String(input.rounds),
    eval_samples: String(input.eval_samples),
    avg_prompt_tokens: String(input.avg_prompt_tokens),
    avg_output_tokens: String(input.avg_output_tokens),
  }).toString();
}

/**
 * Apply the system's `downscale_suggestion` to the current configuration to find **which point it
 * points at**.
 *
 * Returns `null` when the system suggests nothing, or when the suggestion touches a field this
 * screen does not simulate — better to draw nothing than a point that is not what the system said.
 */
function applySuggestion(input: SimInput, estimate: ApiEstimate | null): SimInput | null {
  const steps = estimate?.downscale_suggestion;
  if (!steps || steps.length === 0) return null;

  const next: SimInput = { ...input };
  let touched = false;
  for (const s of steps) {
    if (s.field === 'quantization' && QUANT_LADDER.includes(s.to as SimInput['quantization'])) {
      next.quantization = s.to as SimInput['quantization'];
      touched = true;
    } else if (
      (s.field === 'model_params_b' ||
        s.field === 'candidates' ||
        s.field === 'rounds' ||
        s.field === 'eval_samples') &&
      typeof s.to === 'number'
    ) {
      next[s.field] = s.to;
      touched = true;
    }
  }
  return touched ? next : null;
}

export default function SimulatePage({ params }: PageProps<'/projects/[id]/simulate'>) {
  const { id } = use(params);
  const [input, setInput] = useState<SimInput>(DEFAULTS);
  // Dragging a slider fires dozens of events; only the value it settles on deserves a call.
  const settled = useDebounced(input, 200);

  const preview = (cfg: SimInput) => ({
    queryKey: qk.estimatePreview(id, toQuery(cfg)),
    queryFn: () => api.get<{ estimate: ApiEstimate }>(`/projects/${id}/estimate/preview?${toQuery(cfg)}`),
    staleTime: Infinity,
  });

  const current = useQuery(preview(settled));

  const gridInputs = useMemo<SimInput[]>(
    () =>
      MODEL_LADDER.flatMap((b) =>
        QUANT_LADDER.flatMap((q) =>
          BUDGET_LADDER.map((budget) => ({
            ...settled,
            model_params_b: b,
            quantization: q,
            ...budget,
          })),
        ),
      ),
    [settled],
  );
  const grid = useQueries({ queries: gridInputs.map(preview) });

  const suggestedInput = applySuggestion(settled, current.data?.estimate ?? null);
  const suggested = useQuery({ ...preview(suggestedInput ?? settled), enabled: suggestedInput !== null });

  const points = useMemo<GridPoint[]>(() => {
    const seen = new Set<string>();
    const out: GridPoint[] = [];
    const push = (cfg: SimInput | null, est?: ApiEstimate) => {
      if (!cfg || !est) return;
      const k = toQuery(cfg);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ input: cfg, estimate: est });
    };
    // The selected and suggested configurations are pushed first: if either coincides with a grid
    // point, their copy wins so the dot is painted in its role rather than lost among the grey ones.
    push(settled, current.data?.estimate);
    push(suggestedInput, suggested.data?.estimate);
    gridInputs.forEach((cfg, i) => push(cfg, grid[i]?.data?.estimate));
    return out;
  }, [settled, current.data, suggestedInput, suggested.data, gridInputs, grid]);

  const currentPoint = points.find((p) => toQuery(p.input) === toQuery(settled)) ?? null;
  const suggestedPoint =
    suggestedInput === null
      ? null
      : (points.find((p) => toQuery(p.input) === toQuery(suggestedInput)) ?? null);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">Cost simulation</h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Drag the sliders to watch VRAM, cost and time move ·{' '}
          <Link
            href={`/projects/${id}/step/3`}
            className="text-brand-strong underline underline-offset-2"
          >
            back to step 3
          </Link>
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-[320px_1fr]">
        <Panel accent="brand" icon={SlidersHorizontal} title="Configuration">
          <div className="space-y-3">
            <SliderRow
              id="sim-params"
              label="Model size (billion parameters)"
              value={input.model_params_b}
              min={1}
              max={180}
              onChange={(v) => setInput((s) => ({ ...s, model_params_b: v }))}
            />
            <QuantPicker
              value={input.quantization}
              onChange={(v) => setInput((s) => ({ ...s, quantization: v }))}
            />
            <SliderRow
              id="sim-candidates"
              label="Candidates"
              value={input.candidates}
              min={1}
              max={64}
              onChange={(v) => setInput((s) => ({ ...s, candidates: v }))}
            />
            <SliderRow
              id="sim-rounds"
              label="Rounds"
              value={input.rounds}
              min={1}
              max={12}
              onChange={(v) => setInput((s) => ({ ...s, rounds: v }))}
            />
            <SliderRow
              id="sim-eval"
              label="Evaluation samples"
              value={input.eval_samples}
              min={10}
              max={2000}
              step={10}
              onChange={(v) => setInput((s) => ({ ...s, eval_samples: v }))}
            />
            <SliderRow
              id="sim-prompt-tokens"
              label="Average input tokens"
              value={input.avg_prompt_tokens}
              min={200}
              max={8000}
              step={100}
              hint="Affects cost directly, not VRAM."
              onChange={(v) => setInput((s) => ({ ...s, avg_prompt_tokens: v }))}
            />
            <SliderRow
              id="sim-output-tokens"
              label="Average output tokens"
              value={input.avg_output_tokens}
              min={100}
              max={4000}
              step={50}
              onChange={(v) => setInput((s) => ({ ...s, avg_output_tokens: v }))}
            />
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel accent="neutral" icon={Gauge} title="Selected configuration">
            <EstimatePanel
              estimate={current.data?.estimate ?? null}
              stale={current.isFetching || input !== settled}
            />
          </Panel>

          <Panel accent="brand" icon={TrendingDown} title="Pareto frontier">
            <ParetoChart
              points={points}
              current={currentPoint}
              suggested={suggestedPoint}
              onPick={setInput}
            />
            <HintBox tone="warn">
              The vertical axis is VRAM, so <strong>the 24 GB line is a hard limit</strong>: a dot
              inside the red band cannot run on an RTX 3090 no matter how cheap it is. The Pareto
              line joins the configurations no other configuration beats on both cheapness and
              resources — choosing off that line means paying more for nothing extra.
            </HintBox>
            {suggestedPoint && (
              <HintBox tone="info">
                The green dot is the configuration the system suggests once the RTX 3090 limit is
                exceeded: {suggestedPoint.input.model_params_b}B ·{' '}
                {suggestedPoint.input.quantization} · {suggestedPoint.estimate.vram_gb} GB. Click it
                to move the sliders there.
              </HintBox>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
