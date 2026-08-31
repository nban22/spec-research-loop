'use client';

import { Scale } from 'lucide-react';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { EmptyState } from '@/components/states';
import { JUDGE_META, type JudgeKey } from '@/lib/types';
import {
  MIN_UNION,
  useJudgeAgreement,
  type ApiAgreement,
  type ApiJaccardCell,
} from '@/lib/use-judge-agreement';
import { cn } from '@/lib/utils';

/**
 * **B3 · Bất đồng giữa các judge** (#9) — nửa *bất đồng* của chức năng 13.
 *
 * Cả panel là **thông tin để cân nhắc**, không phải lỗi ⇒ họ màu `neutral`, không `warn`
 * (`judge.tsx` đã chốt luật này cho `DisagreementNote`).
 *
 * Ma trận vẽ bằng CSS grid `<div>`, không thư viện biểu đồ — dự án không có recharts/d3 và
 * `STACK.md` §5 giới hạn cài thêm. Nhiệt độ ô dùng thang rời rạc trên token sẵn có, không hex,
 * không `style={{color}}` (frontend/CLAUDE.md §4).
 */
export function JudgeAgreementPanel({
  versionId,
}: {
  versionId: string | undefined;
}) {
  const { data, isLoading } = useJudgeAgreement(versionId);
  const a = data?.agreement ?? null;
  // `enabled === false` nghĩa là cờ `Project.judge_agreement` đang tắt — khác hẳn "chưa chạy
  // judge". Hai trạng thái phải nói khác nhau, không thì người dùng bật cờ rồi vẫn tưởng hỏng.
  const flagOff = data !== undefined && !data.enabled;

  return (
    <Panel accent="neutral" icon={Scale} title="Bất đồng giữa các judge">
      {isLoading ? (
        <p className="text-ink-3 text-xs">Đang tải số đo…</p>
      ) : flagOff ? (
        <EmptyState
          icon={Scale}
          tone="neutral"
          title="Số đo đang tắt"
          description="Bật cờ judge_agreement trên dự án để xem. Phần tính vẫn chạy sẵn ở mỗi vòng judge, nên bật lên là thấy ngay số của các vòng đã chạy — không phải chạy lại."
        />
      ) : !a ? (
        <EmptyState
          icon={Scale}
          tone="neutral"
          title="Chưa có số đo"
          description="Chạy hội đồng Judge ở trên. Số đo được chốt ngay lúc chạy và không tính lại, nên hai lần mở màn hình luôn ra cùng một con số."
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

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

function KappaHeadline({ a }: { a: ApiAgreement }) {
  const k = a.kappa;
  return (
    <div className="space-y-2">
      <div className="border-hairline bg-sunken rounded-md border px-2.5 py-2">
        <p className="text-ink-3 text-2xs font-medium tracking-wide uppercase">
          Hệ số trùng lặp (Fleiss κ) · vòng {a.round}
        </p>
        <p className="text-ink-1 text-lg font-semibold tabular-nums">
          {k.kappa === null ? '—' : k.kappa.toFixed(3)}
          <span className="text-ink-3 ml-2 text-xs font-normal">
            {k.raters} judge · {k.items} thẻ
          </span>
        </p>
      </div>

      {/* Con số này rất dễ bị đọc sai, nên phần giải thích không phải trang trí. */}
      <HintBox tone="info" title="Đọc con số này thế nào">
        Năm judge dùng <span className="font-medium">năm prompt khác nhau</span> và bị cấm lấn
        sang phần của nhau, nên đây <span className="font-medium">không</span> phải &ldquo;độ tin
        cậy&rdquo; như khi năm người cùng chấm một bài. Nó đo{' '}
        <span className="font-medium">mức trùng lặp</span>: κ thấp nghĩa là năm vai đang làm đúng
        việc riêng; κ cao nghĩa là bạn trả tiền cho năm judge mà chỉ nhận về một.
      </HintBox>

      {k.kappa === null && (
        <HintBox tone="warn">
          {k.reason === 'NO_VARIANCE'
            ? 'Mọi judge cho cùng một nhãn trên mọi thẻ nên hệ số không xác định được. Đây là đồng thuận tuyệt đối, không phải lỗi.'
            : k.reason === 'INSUFFICIENT_ITEMS'
              ? 'Chỉ có một thẻ, nên hệ số luôn ra một hằng số bất kể dữ liệu — không mang thông tin gì.'
              : k.reason === 'INSUFFICIENT_RATERS'
                ? 'Dưới hai judge hoàn thành, không có gì để so.'
                : 'Chưa có thẻ nào để đo.'}
        </HintBox>
      )}

      {k.degenerate === 'IDENTICAL_ROWS' && (
        <HintBox tone="warn">
          Mọi thẻ có cùng dạng phân bố phiếu, nên hệ số bằng đúng{' '}
          <span className="tabular-nums">{(-1 / (k.raters - 1)).toFixed(2)}</span> bất kể judge
          chấm thế nào — <span className="font-medium">không có cấu trúc chồng lấn nào</span> để đọc.
        </HintBox>
      )}

      {a.coverage !== null && a.coverage < 1 && (
        <p className="text-ink-3 text-xs">
          {pct(a.coverage)} issue có gắn thẻ. Phần còn lại nằm ngoài phép đo — và tỉ lệ đó tự nó
          là hành vi của judge.
        </p>
      )}
    </div>
  );
}

/** Thang nhiệt rời rạc trên token sẵn có. Không nội suy màu, không hex. */
function cellClass(cell: ApiJaccardCell): string {
  if (cell.value === null) return 'bg-canvas text-ink-4';
  if (cell.union < MIN_UNION) return 'bg-sunken text-ink-4';
  if (cell.value >= 0.75) return 'bg-brand-ink text-white';
  if (cell.value >= 0.5) return 'bg-brand-line text-ink-1';
  if (cell.value >= 0.25) return 'bg-brand-soft text-ink-1';
  return 'bg-sunken text-ink-2';
}

function JaccardGrid({ a }: { a: ApiAgreement }) {
  const keys = a.raters;
  if (keys.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-ink-2 text-xs font-medium">Chồng lấn từng cặp</p>
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5 text-2xs"
          style={{ gridTemplateColumns: `2.5rem repeat(${keys.length}, minmax(2.75rem, 1fr))` }}
        >
          <div />
          {keys.map((k) => (
            <div key={`head-${k}`} className="text-ink-3 pb-0.5 text-center font-semibold">
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
                return (
                  <div
                    key={`${row}-${col}`}
                    className={cn(
                      'border-hairline flex flex-col items-center justify-center rounded-sm border py-1 tabular-nums',
                      cellClass(cell),
                    )}
                  >
                    {/* Số phải hiện trong ô, không chỉ trong title (DESIGN_SYSTEM §6.7). */}
                    <span className="font-semibold">
                      {cell.value === null ? '—' : cell.value.toFixed(2)}
                    </span>
                    <span className="opacity-70">n={cell.union}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-ink-3 text-xs">
        Tỉ lệ nhóm vấn đề mà <span className="font-medium">cả hai</span> judge cùng nêu, trên số
        nhóm <span className="font-medium">ít nhất một</span> nêu. <span className="tabular-nums">n</span>{' '}
        là cỡ mẫu; ô có <span className="tabular-nums">n&nbsp;&lt;&nbsp;{MIN_UNION}</span> bị làm
        mờ vì hai judge mỗi người nêu vài issue có thể trùng nhau hoàn toàn do ngẫu nhiên.
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

  // Hai dòng dưới **buộc tội một judge cụ thể**, nên chúng đi qua kiểm định null hoán vị.
  //
  // Không có nó thì cả hai luôn tìm ra một người: cực đại của năm số thực gần như chắc chắn dương.
  // Đo thật dưới null năm judge thống kê giống nhau: "gây nhiễu nhất" bắn **100%** lượt,
  // "chấm nặng tay nhất" **98.2%**. Panel khi đó luôn chỉ ra một kẻ có tội, và #8 dồn tài nguyên
  // đắt vào đó kể cả khi không có ai đáng bị chỉ.
  //
  // `draws === 0` là bản ghi lưu **trước khi** có kiểm định ⇒ *chưa kiểm*, khác hẳn *đã kiểm và
  // không đáng kể*. Cả hai đều không nêu tên, nhưng nói khác nhau.
  const nt = a.nullTest;
  const untested = nt.draws === 0;
  const harsh = nt.harsh?.significant ? nt.harsh : null;
  const disruptive = nt.disruptive?.significant ? nt.disruptive : null;

  /** Vì sao dòng này không nêu tên ai. */
  const why = (v: { p: number } | null | undefined) =>
    untested
      ? 'chưa kiểm định'
      : v
        ? `không đáng kể (p = ${v.p.toFixed(3)})`
        : 'không có';

  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-ink-2 text-xs font-medium">Đáng chú ý</p>
      <ul className="border-hairline divide-hairline divide-y rounded-md border">
        <Row
          label="Cặp trùng nhau nhất"
          value={
            topPair
              ? `${topPair.pair} — ${pct(topPair.value)} (n=${topPair.union})`
              : 'chưa đủ mẫu'
          }
          hint="Trùng cao thì một trong hai judge có thể là thừa. Nhưng J1/J3/J5 dùng model khác J2/J4, nên trùng cao trong cùng họ model có thể là hiệu ứng model chứ không phải hiệu ứng vai."
        />
        <Row
          label="Hay đứng một mình"
          value={
            loner
              ? `${loner.judgeKey} — ${pct(loner.rate)} (${loner.solo}/${loner.raised} nhóm)`
              : 'không có'
          }
          hint="Tính theo tỉ lệ trên số nhóm chính judge đó nêu, không theo số đếm thô — nếu không thì judge nêu nhiều nhất luôn đứng đầu."
        />
        <Row
          label="Chấm nặng tay nhất"
          value={
            harsh
              ? `${harsh.judgeKey} — +${harsh.value.toFixed(2)} bậc (p = ${harsh.p.toFixed(3)})`
              : why(nt.harsh)
          }
          hint="Chênh bậc mức độ so với các judge cùng nêu một nhóm. Dương là nặng tay hơn. Chỉ nêu tên khi p < 0.05 dưới null hoán vị nhãn judge — không thì cực đại của năm số luôn dương và dòng này luôn buộc tội một người."
        />
        <Row
          label="Gây nhiễu nhất"
          value={
            disruptive
              ? `${disruptive.judgeKey} — bỏ ra thì κ tăng ${disruptive.value.toFixed(3)} (p = ${disruptive.p.toFixed(3)})`
              : why(nt.disruptive)
          }
          hint="Bỏ từng judge ra rồi tính lại. Đây là con số B2 (#8) dùng để chọn judge nào cần chạy tự nhất quán — thay vì bật cho cả năm. Chỉ nêu tên khi p < 0.05: Δκ dương nhỏ là chuyện bình thường kể cả khi năm judge giống nhau hoàn toàn."
        />
        <Row
          label="Nhóm cả hội đồng cùng nêu"
          value={`${a.unanimousGroups} nhóm (trên ${a.kappa.raters} judge)`}
          hint="Cả hội đồng cùng chỉ ra thì nên sửa trước. Con số này là cận dưới vì bước gộp nhóm bằng luật có thể bỏ sót cách diễn đạt khác nhau."
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
        <span className="text-ink-1 text-xs font-semibold tabular-nums">{value}</span>
      </div>
      <p className="text-ink-3 mt-0.5 text-xs">{hint}</p>
    </li>
  );
}
