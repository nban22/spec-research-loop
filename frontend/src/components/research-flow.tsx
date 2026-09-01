'use client';

import { Pause, Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * **Animation mô tả luồng nghiên cứu** — Bước 1 của đề, mục *Khuyến khích sáng tạo*:
 * *"Sơ đồ · Concept map · Danh sách thành phần · Animation mô tả luồng nghiên cứu"*.
 *
 * Câu hỏi nó trả lời trong 20 giây: **một ý tưởng mơ hồ biến thành bản đặc tả có nguồn bằng cách
 * nào.** Trang chủ trước đây trả lời câu đó bằng hai câu chữ; ai chưa dùng hệ thống thì đọc xong
 * vẫn không hình dung được có bao nhiêu bước và bước nào làm gì.
 *
 * ## Ba quyết định
 *
 * 1. **Tự chạy, nhưng dừng được và tua tay được.** Animation tự chạy mà không tắt được là quảng
 *    cáo; đứng yên chờ bấm thì không ai bấm. Có nút dừng thật và sáu nút nhảy thẳng tới từng chặng.
 * 2. **Mỗi chặng vẽ đúng thứ chặng đó làm ra** — thẻ, chấm nguồn, đường nối, huy hiệu judge — chứ
 *    không phải sáu ô chữ nhật đổi màu. Hình phải mang thông tin, nếu không thì một danh sách gạch
 *    đầu dòng đã đủ và rẻ hơn.
 * 3. **`prefers-reduced-motion` thì KHÔNG tự chạy.** Chuyển động tự động là thứ khó chịu nhất với
 *    người nhạy cảm tiền đình. Khi đó nó thành một sơ đồ tĩnh, tua bằng nút.
 */

type Stage = {
  key: string;
  step: string;
  title: string;
  detail: string;
  /** Vẽ gì ở khung bên phải — mỗi chặng một hình riêng. */
  art: 'idea' | 'cards' | 'sources' | 'links' | 'judges' | 'spec';
};

const STAGES: Stage[] = [
  {
    key: 'idea',
    step: 'B1',
    title: 'Ý tưởng còn mơ hồ',
    detail: 'Bạn viết một câu. Hệ thống diễn giải lại rồi hỏi ngược: tôi hiểu đúng chưa?',
    art: 'idea',
  },
  {
    key: 'cards',
    step: 'B1',
    title: 'Phân rã thành thẻ',
    detail: 'Problem · research question · gap · contribution · claim · evidence — mỗi thứ một thẻ, mỗi thẻ một trạng thái.',
    art: 'cards',
  },
  {
    key: 'sources',
    step: 'B2',
    title: 'Đi tìm tài liệu thật',
    detail: 'Nguồn lấy từ Semantic Scholar và OpenAlex, đối chiếu DOI. Không để mô hình tự nhớ paper.',
    art: 'sources',
  },
  {
    key: 'links',
    step: 'B3',
    title: 'Nối claim với bằng chứng',
    detail: 'Mỗi phát biểu phải chỉ ra được câu nào trong paper nào đỡ cho nó. Claim không nối được là claim treo.',
    art: 'links',
  },
  {
    key: 'judges',
    step: 'B4',
    title: 'Năm judge phản biện',
    detail: 'Năm phạm vi tách rời, chấm độc lập trước khi thấy nhận xét của nhau. Bạn là người quyết sửa gì.',
    art: 'judges',
  },
  {
    key: 'spec',
    step: 'B5',
    title: 'Bản đặc tả 14 mục',
    detail: 'Còn claim chưa có nguồn thì hệ thống chặn xuất bản. Không phải cảnh báo — chặn thật.',
    art: 'spec',
  },
];

/** Nhịp tự chạy. 3,4 giây đủ đọc hết một dòng mô tả mà không thành sốt ruột. */
const DWELL_MS = 3400;

export function ResearchFlowAnimation() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  // Người đã tắt hiệu ứng thì mặc định KHÔNG tự chạy — xem quyết định 3 ở đầu file.
  const [playing, setPlaying] = useState(!reduced);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setActive((i) => (i + 1) % STAGES.length), DWELL_MS);
    return () => clearInterval(t);
  }, [playing]);

  const stage = STAGES[active];

  /** Bấm tay là dừng tự chạy — nếu không thì vừa chọn xong 2 giây sau nó nhảy đi mất. */
  const pick = (i: number) => {
    setActive(i);
    setPlaying(false);
  };

  return (
    <section
      aria-label="Luồng nghiên cứu qua năm bước"
      className="border-hairline bg-surface space-y-3 rounded-lg border px-3 py-3 md:px-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-ink-1 text-sm font-medium">Một vòng làm việc trông thế nào</h2>
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? 'Dừng minh hoạ' : 'Chạy minh hoạ'}
          className="border-hairline text-ink-3 hover:text-brand-strong ease-out-quart flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors duration-150"
        >
          {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          {playing ? 'Dừng' : 'Chạy'}
        </button>
      </div>

      <StageRail active={active} onPick={pick} />

      <div className="grid gap-3 md:grid-cols-[1fr_240px] md:items-center">
        <div className="min-h-24">
          {/* Không bọc `AnimatePresence`: hoạt cảnh **ra** ở đây không đáng giá bằng cái nó
              đánh đổi — nội dung mới phải chờ nội dung cũ chạy xong mới được gắn, nên trình đọc
              màn hình và test đều thấy khoảng trống ở giữa. Đổi `key` là React thay ngay, và
              phần fade vào mới là thứ mắt thật sự đọc được. */}
          <div>
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-1"
            >
              <p className="text-brand-strong text-2xs font-medium">
                {stage.step} · bước {active + 1}/{STAGES.length}
              </p>
              <p className="text-ink-1 text-sm font-medium">{stage.title}</p>
              <p className="text-ink-3 text-xs leading-relaxed">{stage.detail}</p>
            </motion.div>
          </div>
        </div>

        <StageArt art={stage.art} reduced={!!reduced} />
      </div>
    </section>
  );
}

/**
 * Thanh sáu chặng. Là **nút thật**, không phải chấm trang trí — người dùng nhảy thẳng tới chặng
 * muốn xem, và bàn phím đi qua được (frontend/CLAUDE.md §7).
 */
function StageRail({ active, onPick }: { active: number; onPick: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const done = i < active;
        const on = i === active;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={on ? 'step' : undefined}
              aria-label={`Chặng ${i + 1}: ${s.title}`}
              className={cn(
                'ease-out-quart h-1.5 flex-1 cursor-pointer rounded-full transition-colors duration-300',
                on ? 'bg-brand-ink' : done ? 'bg-brand-line' : 'bg-neutral-line',
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}

const ART_W = 240;
const ART_H = 132;

/** Khung hình của từng chặng. Mỗi `art` một hình riêng — xem quyết định 2 ở đầu file. */
function StageArt({ art, reduced }: { art: Stage['art']; reduced: boolean }) {
  const spring = reduced
    ? { duration: 0 }
    : ({ type: 'spring', stiffness: 300, damping: 26 } as const);

  return (
    <div className="border-hairline bg-canvas rounded-md border">
      <svg
        viewBox={`0 0 ${ART_W} ${ART_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Minh hoạ chặng ${art}`}
      >
        <motion.g
          key={art}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
            {art === 'idea' && (
              <>
                {/* Ý tưởng thô: mấy vệt chữ mờ, không hình thù rõ ràng. */}
                {[0, 1, 2].map((i) => (
                  <motion.rect
                    key={i}
                    x={40}
                    y={44 + i * 16}
                    height={7}
                    rx={3.5}
                    className="fill-neutral-line"
                    initial={{ width: 0 }}
                    animate={{ width: [130, 160, 96][i] }}
                    transition={{ ...spring, delay: reduced ? 0 : i * 0.08 }}
                  />
                ))}
              </>
            )}

            {art === 'cards' && (
              <>
                {/* Sáu thẻ nảy ra theo thứ tự — đúng cái mà bước phân rã sinh ra. */}
                {Array.from({ length: 6 }, (_, i) => (
                  <motion.rect
                    key={i}
                    x={26 + (i % 3) * 66}
                    y={34 + Math.floor(i / 3) * 40}
                    width={56}
                    height={30}
                    rx={5}
                    className={cn(
                      i % 3 === 0 ? 'fill-ok-soft' : i % 3 === 1 ? 'fill-brand-soft' : 'fill-warn-soft',
                    )}
                    stroke="currentColor"
                    strokeWidth={0.6}
                    initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...spring, delay: reduced ? 0 : i * 0.06 }}
                    style={{ transformOrigin: `${54 + (i % 3) * 66}px ${49 + Math.floor(i / 3) * 40}px` }}
                  />
                ))}
              </>
            )}

            {art === 'sources' && (
              <>
                {Array.from({ length: 7 }, (_, i) => {
                  const cx = 34 + i * 28;
                  const cy = 46 + ((i * 37) % 48);
                  return (
                    <motion.circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={7 - (i % 3)}
                      className="fill-brand-ink"
                      initial={{ opacity: 0, scale: reduced ? 1 : 0.3 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ ...spring, delay: reduced ? 0 : i * 0.07 }}
                      style={{ transformOrigin: `${cx}px ${cy}px` }}
                    />
                  );
                })}
                <text x={ART_W / 2} y={116} textAnchor="middle" className="fill-ink-4 text-[9px]">
                  Semantic Scholar · OpenAlex · Crossref
                </text>
              </>
            )}

            {art === 'links' && (
              <>
                {/* Ba claim bên trái, ba nguồn bên phải. Đường nối vẽ dần ra. */}
                {[0, 1, 2].map((i) => (
                  <rect
                    key={`c${i}`}
                    x={20}
                    y={30 + i * 30}
                    width={54}
                    height={20}
                    rx={4}
                    className="fill-brand-soft"
                  />
                ))}
                {[0, 1, 2].map((i) => (
                  <circle key={`s${i}`} cx={196} cy={40 + i * 30} r={7} className="fill-ok-ink" />
                ))}
                {[
                  [0, 0],
                  [1, 1],
                  [1, 2],
                ].map(([from, to], i) => (
                  <motion.line
                    key={i}
                    x1={74}
                    y1={40 + from * 30}
                    x2={189}
                    y2={40 + to * 30}
                    className="stroke-ok-ink"
                    strokeWidth={1.5}
                    initial={{ pathLength: reduced ? 1 : 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.15 + i * 0.18 }}
                  />
                ))}
                {/* Claim thứ ba không nối được — claim treo, tô cảnh báo. */}
                <motion.rect
                  x={20}
                  y={90}
                  width={54}
                  height={20}
                  rx={4}
                  className="fill-warn-soft stroke-warn-line"
                  strokeWidth={1.2}
                  strokeDasharray="3 2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.8 }}
                />
              </>
            )}

            {art === 'judges' && (
              <>
                {Array.from({ length: 5 }, (_, i) => (
                  <motion.g key={i}>
                    <motion.rect
                      x={16 + i * 44}
                      y={34}
                      width={36}
                      height={44}
                      rx={5}
                      className="fill-decide-soft stroke-decide-line"
                      strokeWidth={0.8}
                      initial={{ opacity: 0, y: reduced ? 34 : 20 }}
                      animate={{ opacity: 1, y: 34 }}
                      transition={{ ...spring, delay: reduced ? 0 : i * 0.08 }}
                    />
                    <text
                      x={34 + i * 44}
                      y={60}
                      textAnchor="middle"
                      className="fill-decide-strong text-[10px] font-medium"
                    >
                      J{i + 1}
                    </text>
                  </motion.g>
                ))}
                <motion.text
                  x={ART_W / 2}
                  y={100}
                  textAnchor="middle"
                  className="fill-ink-4 text-[9px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.5 }}
                >
                  chấm độc lập, không thấy nhận xét của nhau
                </motion.text>
              </>
            )}

            {art === 'spec' && (
              <>
                <motion.rect
                  x={78}
                  y={20}
                  width={84}
                  height={100}
                  rx={6}
                  className="fill-surface stroke-ok-line"
                  strokeWidth={1.4}
                  initial={{ opacity: 0, scale: reduced ? 1 : 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={spring}
                  style={{ transformOrigin: '120px 70px' }}
                />
                {Array.from({ length: 7 }, (_, i) => (
                  <motion.rect
                    key={i}
                    x={88}
                    y={32 + i * 12}
                    height={4}
                    rx={2}
                    className={i === 6 ? 'fill-ok-ink' : 'fill-neutral-line'}
                    initial={{ width: 0 }}
                    animate={{ width: i === 6 ? 40 : 64 }}
                    transition={{ duration: reduced ? 0 : 0.28, delay: reduced ? 0 : 0.1 + i * 0.05 }}
                  />
                ))}
              </>
            )}
        </motion.g>
      </svg>
    </div>
  );
}
