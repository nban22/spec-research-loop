import { EstimatorService, type EstimatorInput } from './estimator.service';

const base: EstimatorInput = {
  model_params_b: 7,
  quantization: 'int8',
  candidates: 8,
  rounds: 3,
  eval_samples: 100,
  avg_prompt_tokens: 1200,
  avg_output_tokens: 400,
};

describe('EstimatorService', () => {
  const svc = new EstimatorService();

  it('model 7B int8 vừa RTX 3090', () => {
    const r = svc.estimate(base);
    expect(r.vram_gb).toBeCloseTo(8.15, 1);
    expect(r.fits_rtx3090).toBe(true);
  });

  it('model 70B fp16 vượt 24GB và đề xuất hạ lượng tử hoá', () => {
    const r = svc.estimate({
      ...base,
      model_params_b: 70,
      quantization: 'fp16',
    });
    expect(r.fits_rtx3090).toBe(false);
    expect(r.downscale_suggestion?.[0]).toMatchObject({
      field: 'quantization',
      from: 'fp16',
      to: 'int8',
    });
  });

  it('đã ở int4 mà vẫn vượt thì đề xuất giảm số tham số', () => {
    const r = svc.estimate({
      ...base,
      model_params_b: 180,
      quantization: 'int4',
    });
    expect(r.fits_rtx3090).toBe(false);
    expect(r.downscale_suggestion?.[0].field).toBe('model_params_b');
  });

  it('cảnh báo khi tiệm cận ngưỡng 20GB dù vẫn vừa 24GB', () => {
    // 9B × 2 byte/param × 1.25 overhead ≈ 20.9 GB — vừa RTX 3090 nhưng đã qua mốc cảnh báo.
    const r = svc.estimate({
      ...base,
      model_params_b: 9,
      quantization: 'fp16',
    });
    expect(r.vram_gb).toBeGreaterThanOrEqual(20);
    expect(r.fits_rtx3090).toBe(true);
    expect(r.warn_near_limit).toBe(true);
  });

  it('lịch chạy quá dài thì đề xuất giảm quy mô thí nghiệm', () => {
    const r = svc.estimate({ ...base, candidates: 64, eval_samples: 2000 });
    expect(r.hours_max).toBeGreaterThan(48);
    expect(r.downscale_suggestion?.some((s) => s.field === 'candidates')).toBe(
      true,
    );
  });

  it('token và chi phí tỉ lệ với số lời gọi', () => {
    const r1 = svc.estimate(base);
    const r2 = svc.estimate({ ...base, rounds: 6 });
    expect(r2.tokens_est).toBe(r1.tokens_est * 2);
    expect(r2.cost_usd).toBeCloseTo(r1.cost_usd * 2, 1);
  });

  it('không đề xuất gì khi cấu hình đã vừa và lịch chạy ngắn', () => {
    const r = svc.estimate({ ...base, candidates: 2, eval_samples: 50 });
    expect(r.downscale_suggestion).toBeNull();
  });
});
