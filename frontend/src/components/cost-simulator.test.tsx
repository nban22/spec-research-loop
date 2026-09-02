import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ParetoChart,
  QuantPicker,
  SliderRow,
  paretoFront,
  qualityProxy,
  type GridPoint,
  type SimInput,
} from './cost-simulator';
import type { ApiEstimate } from '@/lib/types';

/**
 * Three things worth locking down:
 *
 * 1. **The Pareto definition** — a point drops only when dominated on both axes; a tie survives.
 * 2. **The 24 GB line is always present**, even when every configuration sits far below it.
 * 3. **The slider is a real input with an `htmlFor` label** — not a div catching mouse events.
 */

const input = (over: Partial<SimInput> = {}): SimInput => ({
  model_params_b: 13,
  quantization: 'fp16',
  candidates: 8,
  rounds: 3,
  eval_samples: 200,
  avg_prompt_tokens: 1200,
  avg_output_tokens: 600,
  ...over,
});

const estimate = (over: Partial<ApiEstimate> = {}): ApiEstimate => ({
  inputs: {},
  vram_gb: 12,
  hours_min: 1,
  hours_max: 3,
  tokens_est: 100_000,
  cost_usd: 0.05,
  fits_rtx3090: true,
  warn_near_limit: false,
  downscale_suggestion: null,
  breakdown: [],
  ...over,
});

const point = (i: Partial<SimInput>, e: Partial<ApiEstimate>): GridPoint => ({
  input: input(i),
  estimate: estimate(e),
});

describe('qualityProxy', () => {
  it('scores a bigger model higher', () => {
    expect(qualityProxy(input({ model_params_b: 70 }))).toBeGreaterThan(
      qualityProxy(input({ model_params_b: 7 })),
    );
  });

  it('scores a bigger search budget higher', () => {
    expect(qualityProxy(input({ candidates: 16 }))).toBeGreaterThan(
      qualityProxy(input({ candidates: 4 })),
    );
  });

  it('scores lower quantisation lower — otherwise int4 and fp16 would tie', () => {
    const fp16 = qualityProxy(input({ quantization: 'fp16' }));
    const int8 = qualityProxy(input({ quantization: 'int8' }));
    const int4 = qualityProxy(input({ quantization: 'int4' }));
    expect(fp16).toBeGreaterThan(int8);
    expect(int8).toBeGreaterThan(int4);
  });
});

describe('paretoFront', () => {
  it('drops a configuration that is both pricier and weaker', () => {
    const good = point({ model_params_b: 70 }, { cost_usd: 0.05 });
    const bad = point({ model_params_b: 7 }, { cost_usd: 0.09 });
    expect(paretoFront([good, bad])).toEqual([good]);
  });

  it('keeps both when one is cheaper but weaker — that is a real trade-off', () => {
    const cheap = point({ model_params_b: 7 }, { cost_usd: 0.02 });
    const strong = point({ model_params_b: 70 }, { cost_usd: 0.2 });
    expect(paretoFront([cheap, strong])).toHaveLength(2);
  });

  it('does not treat a tie on one axis as domination', () => {
    const a = point({ model_params_b: 13, candidates: 8 }, { cost_usd: 0.05 });
    const b = point({ model_params_b: 13, candidates: 8, rounds: 3 }, { cost_usd: 0.05 });
    expect(paretoFront([a, b])).toHaveLength(2);
  });

  it('returns empty for an empty list without breaking', () => {
    expect(paretoFront([])).toEqual([]);
  });
});

describe('ParetoChart', () => {
  const points = [
    point({ model_params_b: 7, quantization: 'int4' }, { cost_usd: 0.02, vram_gb: 4 }),
    point({ model_params_b: 70, quantization: 'fp16' }, { cost_usd: 0.2, vram_gb: 175 }),
  ];

  it('says the grid is building when there are no points, instead of an empty SVG', () => {
    render(<ParetoChart points={[]} current={null} suggested={null} onPick={vi.fn()} />);
    expect(screen.getByText('Building the config grid…')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('always draws the 24 GB line, even when every configuration is below it', () => {
    render(
      <ParetoChart
        points={[point({}, { vram_gb: 3, cost_usd: 0.01 })]}
        current={null}
        suggested={null}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByText('24 GB · RTX 3090')).toBeInTheDocument();
  });

  it('calls onPick with that dot configuration when a dot is clicked', () => {
    const onPick = vi.fn();
    render(
      <ParetoChart points={points} current={null} suggested={null} onPick={onPick} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Select config 70B fp16/ }));
    expect(onPick).toHaveBeenCalledWith(points[1].input);
  });

  it('marks the selected dot with aria-pressed', () => {
    render(
      <ParetoChart
        points={points}
        current={points[0]}
        suggested={null}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Select config 7B int4/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('names VRAM and cost on the dot, without requiring a hover', () => {
    render(<ParetoChart points={points} current={null} suggested={null} onPick={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /175 GB, \$0\.2000/ }),
    ).toBeInTheDocument();
  });
});

describe('SliderRow', () => {
  it('is a real range input with an htmlFor label', () => {
    render(
      <SliderRow id="sim-x" label="Rounds" value={3} min={1} max={12} onChange={vi.fn()} />,
    );
    const slider = screen.getByLabelText('Rounds');
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveValue('3');
  });

  it('reports on drag, with no confirm button needed', () => {
    const onChange = vi.fn();
    render(
      <SliderRow id="sim-x" label="Rounds" value={3} min={1} max={12} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText('Rounds'), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe('QuantPicker', () => {
  it('marks the selected level with aria-pressed and reports another one on click', () => {
    const onChange = vi.fn();
    render(<QuantPicker value="int8" onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'int8' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'int4' }));
    expect(onChange).toHaveBeenCalledWith('int4');
  });
});
