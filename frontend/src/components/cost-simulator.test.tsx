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
 * Ba thứ đáng khoá lại:
 *
 * 1. **Định nghĩa Pareto** — bị lấn cả hai chiều mới bị loại; hoà một chiều thì vẫn ở lại.
 * 2. **Vạch 24 GB luôn có mặt**, kể cả khi mọi cấu hình đều nhẹ hơn ngưỡng nhiều.
 * 3. **Thanh trượt là input thật có nhãn gắn `htmlFor`** — không phải div bắt sự kiện chuột.
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
  it('model to hơn thì điểm cao hơn', () => {
    expect(qualityProxy(input({ model_params_b: 70 }))).toBeGreaterThan(
      qualityProxy(input({ model_params_b: 7 })),
    );
  });

  it('ngân sách tìm kiếm lớn hơn thì điểm cao hơn', () => {
    expect(qualityProxy(input({ candidates: 16 }))).toBeGreaterThan(
      qualityProxy(input({ candidates: 4 })),
    );
  });

  it('lượng tử hoá thấp hơn thì điểm thấp hơn — nếu không, int4 và fp16 hoà nhau', () => {
    const fp16 = qualityProxy(input({ quantization: 'fp16' }));
    const int8 = qualityProxy(input({ quantization: 'int8' }));
    const int4 = qualityProxy(input({ quantization: 'int4' }));
    expect(fp16).toBeGreaterThan(int8);
    expect(int8).toBeGreaterThan(int4);
  });
});

describe('paretoFront', () => {
  it('loại cấu hình vừa đắt hơn vừa kém hơn', () => {
    const good = point({ model_params_b: 70 }, { cost_usd: 0.05 });
    const bad = point({ model_params_b: 7 }, { cost_usd: 0.09 });
    expect(paretoFront([good, bad])).toEqual([good]);
  });

  it('giữ cả hai khi rẻ hơn nhưng kém hơn — đó là một đánh đổi thật', () => {
    const cheap = point({ model_params_b: 7 }, { cost_usd: 0.02 });
    const strong = point({ model_params_b: 70 }, { cost_usd: 0.2 });
    expect(paretoFront([cheap, strong])).toHaveLength(2);
  });

  it('hoà ở một chiều thì chưa gọi là bị lấn', () => {
    const a = point({ model_params_b: 13, candidates: 8 }, { cost_usd: 0.05 });
    const b = point({ model_params_b: 13, candidates: 8, rounds: 3 }, { cost_usd: 0.05 });
    expect(paretoFront([a, b])).toHaveLength(2);
  });

  it('danh sách rỗng trả rỗng, không vỡ', () => {
    expect(paretoFront([])).toEqual([]);
  });
});

describe('ParetoChart', () => {
  const points = [
    point({ model_params_b: 7, quantization: 'int4' }, { cost_usd: 0.02, vram_gb: 4 }),
    point({ model_params_b: 70, quantization: 'fp16' }, { cost_usd: 0.2, vram_gb: 175 }),
  ];

  it('chưa có điểm nào thì báo đang dựng lưới, không vẽ SVG rỗng', () => {
    render(<ParetoChart points={[]} current={null} suggested={null} onPick={vi.fn()} />);
    expect(screen.getByText('Đang dựng lưới cấu hình…')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('luôn vẽ vạch 24 GB, kể cả khi mọi cấu hình đều nhẹ hơn ngưỡng', () => {
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

  it('bấm một chấm gọi onPick với đúng cấu hình của chấm đó', () => {
    const onPick = vi.fn();
    render(
      <ParetoChart points={points} current={null} suggested={null} onPick={onPick} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Chọn cấu hình 70B fp16/ }));
    expect(onPick).toHaveBeenCalledWith(points[1].input);
  });

  it('chấm đang chọn được đánh dấu aria-pressed', () => {
    render(
      <ParetoChart
        points={points}
        current={points[0]}
        suggested={null}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Chọn cấu hình 7B int4/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('nhãn của chấm nói đủ VRAM và chi phí, không bắt người dùng hover', () => {
    render(<ParetoChart points={points} current={null} suggested={null} onPick={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /175 GB, \$0\.2000/ }),
    ).toBeInTheDocument();
  });
});

describe('SliderRow', () => {
  it('là input range thật, có nhãn gắn htmlFor', () => {
    render(
      <SliderRow id="sim-x" label="Số vòng" value={3} min={1} max={12} onChange={vi.fn()} />,
    );
    const slider = screen.getByLabelText('Số vòng');
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveValue('3');
  });

  it('kéo là báo ngay, không cần bấm nút xác nhận', () => {
    const onChange = vi.fn();
    render(
      <SliderRow id="sim-x" label="Số vòng" value={3} min={1} max={12} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText('Số vòng'), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe('QuantPicker', () => {
  it('mức đang chọn có aria-pressed, và bấm mức khác thì báo lên', () => {
    const onChange = vi.fn();
    render(<QuantPicker value="int8" onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'int8' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'int4' }));
    expect(onChange).toHaveBeenCalledWith('int4');
  });
});
