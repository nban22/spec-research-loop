'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import type { ApiEstimate } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * **Mô phỏng chi phí + đường Pareto** — issue #18 (làn C).
 *
 * Ghép hai gợi ý của đề: *cost simulator* (Bước 7) và *Pareto frontier giữa chất lượng và chi
 * phí* (Bước 6). Toàn bộ số liệu lấy từ `GET /projects/:id/estimate/preview` đang có —
 * **không thêm endpoint mới**, và không chép lại công thức của `EstimatorService` sang đây.
 * Chép công thức thì hai bên sẽ lệch nhau ngay lần đầu ai đó sửa đơn giá.
 *
 * Phần vẽ do file này lo; phần gọi API do trang chứa nó lo, nên component này test được mà không
 * cần mạng.
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

/** Một điểm trên lưới: cấu hình cộng kết quả ước lượng mà server trả về cho đúng cấu hình đó. */
export type GridPoint = { input: SimInput; estimate: ApiEstimate };

/** Ngưỡng VRAM của RTX 3090 — con số này là **nội dung của đề bài**, không phải cấu hình hạ tầng. */
const RTX3090_GB = 24;

const W = 640;
const H = 360;
const PAD = { top: 18, right: 16, bottom: 34, left: 44 };

/**
 * **Điểm chất lượng ở đây là một ước lượng thay thế, không phải số đo.**
 *
 * Hệ thống chưa có chỉ số chất lượng thật cho một cấu hình — muốn có thì phải chạy eval, mà chạy
 * eval là chuyện của deliverable #7 chứ không phải của một màn hình mô phỏng. Nên trục tung dùng
 * hai thứ tương quan mạnh với chất lượng và **đã biết trước khi chạy**: cỡ model và ngân sách tìm
 * kiếm. Lấy `log2` vì cả hai đều lợi ích giảm dần — 70B không giỏi gấp mười 7B.
 *
 * Lượng tử hoá **phải** trừ điểm, dù ít. Bỏ qua nó thì int4 và fp16 cùng cỡ model bị coi là chất
 * lượng bằng nhau trong khi int4 nhẹ VRAM hơn hẳn — hệ quả là cả hai cùng trụ trên frontier và
 * đường Pareto zigzag dọc tại cùng một mức chi phí. Trừ 0.5/1.0 bậc `log2` là con số quy ước, đủ
 * để phá thế hoà; nó không phải số đo mất mát thật của lượng tử hoá.
 *
 * Con số này chỉ dùng để **xếp thứ tự** các cấu hình, không dự đoán độ chính xác. Đường Pareto vẽ
 * ra vì thế là "không có cấu hình nào vừa rẻ hơn vừa nhiều tài nguyên hơn", chứ không phải một
 * lời hứa về kết quả.
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
 * Đường Pareto: giữ lại điểm **không bị điểm nào khác lấn cả hai chiều** (rẻ hơn *và* chất lượng
 * cao hơn). Bằng nhau ở một chiều thì chưa gọi là lấn — hai cấu hình cùng giá cùng điểm đều nằm
 * lại, và người dùng tự chọn theo tiêu chí khác.
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
 * Bảng số của cấu hình đang chọn cộng biểu đồ Pareto.
 *
 * `current` có thể là `null` trong lúc đang gọi lại — khi đó giữ nguyên biểu đồ và chỉ làm mờ
 * phần số, để kéo thanh trượt không làm cả màn hình nhấp nháy.
 */
export function ParetoChart({
  points,
  current,
  suggested,
  onPick,
}: {
  points: GridPoint[];
  current: GridPoint | null;
  /** Cấu hình mà hệ thống đề xuất khi vượt RTX 3090 (`downscale_suggestion`), nếu có. */
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
        Đang dựng lưới cấu hình…
      </p>
    );
  }

  const costs = points.map((p) => p.estimate.cost_usd);
  const vrams = points.map((p) => p.estimate.vram_gb);
  const maxCost = Math.max(...costs, 0.0001);
  // Trục tung luôn chứa vạch 24 GB kể cả khi mọi cấu hình đều nhẹ — vạch biến mất thì người dùng
  // tưởng nó không tồn tại, chứ không hiểu là "đang ở rất xa ngưỡng".
  const maxVram = Math.max(...vrams, RTX3090_GB * 1.15);

  const px = (cost: number) =>
    PAD.left + (cost / maxCost) * (W - PAD.left - PAD.right);
  const py = (gb: number) => H - PAD.bottom - (gb / maxVram) * (H - PAD.top - PAD.bottom);

  const front3090 = py(RTX3090_GB);
  /** Đổi khi **tập** cấu hình trên frontier đổi — dùng để biết lúc nào phải hoà mờ sang đường mới. */
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
          aria-label={`Biểu đồ ${points.length} cấu hình: chi phí so với VRAM, kèm vạch 24 GB của RTX 3090`}
        >
          {/* Vùng quá ngưỡng tô nền trước, để "quá vạch" đọc được bằng mắt chứ không phải bằng chữ. */}
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

          {/* Trục */}
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
            chi phí ước tính (USD) →
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

          {/* Đường Pareto vẽ trước để chấm nằm đè lên nó.
              Không tween được thuộc tính `points` — số đỉnh của frontier đổi theo lưới, mà
              `motion` chỉ nội suy được khi hai bên cùng số điểm. Nên chuyển bằng **hoà mờ**:
              đường cũ mờ đi, đường mới hiện lên. Không đúng bằng trượt, nhưng thà hoà mờ còn
              hơn một đường thẳng giật sang hình khác trong một khung hình. */}
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
            const label = `${p.input.model_params_b}B ${p.input.quantization}, ${p.input.candidates} ứng viên × ${p.input.rounds} vòng: ${p.estimate.vram_gb} GB, $${p.estimate.cost_usd.toFixed(4)}`;
            return (
              <g
                key={key(p)}
                role="button"
                tabIndex={0}
                aria-label={`Chọn cấu hình ${label}`}
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
                {/* Chấm **trượt** tới vị trí mới thay vì nhảy. Đây là chỗ ăn thua của cả màn
                    hình: kéo thanh trượt là cả lưới đổi toạ độ, mà nhảy tức thì thì mắt mất dấu
                    điểm mình đang theo dõi và không đọc được nó dịch theo hướng nào. */}
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
          cấu hình đang chọn
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-ok-ink inline-block size-2.5 rounded-full" aria-hidden />
          hệ thống đề xuất
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-brand-line inline-block size-2.5 rounded-full" aria-hidden />
          nằm trên đường Pareto
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-danger-soft inline-block size-2.5 rounded-sm" aria-hidden />
          vượt 24 GB
        </li>
      </ul>
    </div>
  );
}

/** Một thanh trượt có nhãn thật gắn `htmlFor` (frontend/CLAUDE.md §7). */
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
        <span className="text-ink-1 text-xs tabular-nums">{value.toLocaleString('vi-VN')}</span>
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

/** Nhóm nút chọn mức lượng tử hoá — ba giá trị rời rạc, thanh trượt không hợp. */
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
      <p className="text-ink-2 text-xs font-medium">Lượng tử hoá</p>
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
        int8 giảm khoảng một nửa VRAM so với fp16, int4 giảm tiếp một nửa nữa.
      </p>
    </div>
  );
}

/** Bảng số của cấu hình đang chọn. Làm mờ khi đang gọi lại thay vì thay bằng skeleton. */
export function EstimatePanel({
  estimate,
  stale,
}: {
  estimate: ApiEstimate | null;
  stale: boolean;
}) {
  if (!estimate) {
    return <p className="text-ink-3 text-xs">Đang tính…</p>;
  }
  const rows = [
    { label: 'VRAM', value: `${estimate.vram_gb} GB` },
    { label: 'Chi phí ước tính', value: `$${estimate.cost_usd.toFixed(4)}` },
    { label: 'Thời gian', value: `${estimate.hours_min}–${estimate.hours_max} giờ` },
    { label: 'Token ước tính', value: estimate.tokens_est.toLocaleString('vi-VN') },
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
          ? `Vừa RTX 3090 (${estimate.vram_gb}/24 GB).`
          : `Vượt RTX 3090: cần ${estimate.vram_gb} GB, card chỉ có 24 GB.`}
      </p>
    </div>
  );
}
