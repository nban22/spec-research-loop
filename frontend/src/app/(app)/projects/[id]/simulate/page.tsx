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
 * **Mô phỏng chi phí và đường Pareto** — issue #18 (làn C).
 *
 * Mọi con số đến từ `GET /projects/:id/estimate/preview` đang có. **Không thêm endpoint**, và
 * không chép công thức của `EstimatorService` sang frontend — chép thì hai bên lệch nhau ngay
 * lần đầu ai đó sửa đơn giá, mà cái sai đó sẽ không ai phát hiện vì cả hai đều "có vẻ đúng".
 *
 * Cái giá phải trả: mỗi cấu hình là một lời gọi. Chấp nhận được vì endpoint này là **hàm thuần
 * 0 I/O**, và TanStack Query cache theo cấu hình với `staleTime: Infinity` — kết quả của một hàm
 * thuần thì không bao giờ cũ, nên kéo thanh trượt qua lại chỉ tốn mạng đúng lần đầu.
 */

/** Bậc thang lưới. Cỡ model theo các mốc thật hay gặp, không phải chia đều cho đẹp. */
const MODEL_LADDER = [7, 13, 32, 70];
const QUANT_LADDER: SimInput['quantization'][] = ['fp16', 'int8', 'int4'];
/** Ngân sách tìm kiếm: chi phí **chỉ** đổi theo nhóm này, nên thiếu nó thì lưới thành một cột dọc. */
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
 * Áp `downscale_suggestion` của hệ thống lên cấu hình đang chọn để biết nó **trỏ tới điểm nào**.
 *
 * Trả `null` khi hệ thống không đề xuất gì, hoặc khi đề xuất đụng trường mà màn hình này không
 * mô phỏng — thà không vẽ còn hơn vẽ một điểm không đúng thứ hệ thống nói.
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
  // Kéo thanh trượt bắn ra hàng chục sự kiện; chỉ giá trị dừng lại mới đáng một lời gọi.
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
    // Cấu hình đang chọn và cấu hình được đề xuất đẩy lên trước: nếu trùng một điểm của lưới thì
    // giữ bản của chúng, để chấm được tô đúng vai chứ không lẫn vào đám chấm xám.
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
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">Mô phỏng chi phí</h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Kéo thanh trượt để xem VRAM, chi phí và thời gian đổi theo ·{' '}
          <Link
            href={`/projects/${id}/step/3`}
            className="text-brand-strong underline underline-offset-2"
          >
            quay lại bước 3
          </Link>
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-[320px_1fr]">
        <Panel accent="brand" icon={SlidersHorizontal} title="Cấu hình">
          <div className="space-y-3">
            <SliderRow
              id="sim-params"
              label="Cỡ model (tỉ tham số)"
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
              label="Số ứng viên"
              value={input.candidates}
              min={1}
              max={64}
              onChange={(v) => setInput((s) => ({ ...s, candidates: v }))}
            />
            <SliderRow
              id="sim-rounds"
              label="Số vòng"
              value={input.rounds}
              min={1}
              max={12}
              onChange={(v) => setInput((s) => ({ ...s, rounds: v }))}
            />
            <SliderRow
              id="sim-eval"
              label="Số mẫu đánh giá"
              value={input.eval_samples}
              min={10}
              max={2000}
              step={10}
              onChange={(v) => setInput((s) => ({ ...s, eval_samples: v }))}
            />
            <SliderRow
              id="sim-prompt-tokens"
              label="Token vào trung bình"
              value={input.avg_prompt_tokens}
              min={200}
              max={8000}
              step={100}
              hint="Ảnh hưởng thẳng tới chi phí, không ảnh hưởng VRAM."
              onChange={(v) => setInput((s) => ({ ...s, avg_prompt_tokens: v }))}
            />
            <SliderRow
              id="sim-output-tokens"
              label="Token ra trung bình"
              value={input.avg_output_tokens}
              min={100}
              max={4000}
              step={50}
              onChange={(v) => setInput((s) => ({ ...s, avg_output_tokens: v }))}
            />
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel accent="neutral" icon={Gauge} title="Cấu hình đang chọn">
            <EstimatePanel
              estimate={current.data?.estimate ?? null}
              stale={current.isFetching || input !== settled}
            />
          </Panel>

          <Panel accent="brand" icon={TrendingDown} title="Đường Pareto">
            <ParetoChart
              points={points}
              current={currentPoint}
              suggested={suggestedPoint}
              onPick={setInput}
            />
            <HintBox tone="warn">
              Trục tung là VRAM nên <strong>vạch 24 GB là ngưỡng cứng</strong>: chấm nằm trong vùng tô đỏ thì
              RTX 3090 không chạy nổi, dù chi phí có rẻ đến đâu. Đường Pareto nối những cấu hình
              mà không cấu hình nào khác vừa rẻ hơn vừa nhiều tài nguyên hơn — chọn ngoài đường đó
              là bạn đang trả thêm tiền mà không nhận thêm gì.
            </HintBox>
            {suggestedPoint && (
              <HintBox tone="info">
                Chấm xanh lá là cấu hình hệ thống đề xuất khi thấy vượt RTX 3090:{' '}
                {suggestedPoint.input.model_params_b}B · {suggestedPoint.input.quantization} ·{' '}
                {suggestedPoint.estimate.vram_gb} GB. Bạn bấm vào nó để chuyển thanh trượt sang đó.
              </HintBox>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
