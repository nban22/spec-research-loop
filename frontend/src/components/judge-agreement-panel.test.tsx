import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, get } };
});

import { JudgeAgreementPanel } from './judge-agreement-panel';
import type { ApiAgreement } from '@/lib/use-judge-agreement';

/**
 * #9 — số đo bất đồng. Ba hành vi đáng ghim, và cả ba đều là chỗ dễ hiểu sai:
 * κ suy biến phải giải thích thay vì in số, ô Jaccard cỡ mẫu nhỏ phải bị loại khỏi kết luận,
 * và số phải hiện trong ô chứ không chỉ trong `title`.
 */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const base: ApiAgreement = {
  round: 1,
  computed: false,
  kappa: {
    kappa: 0.42,
    reason: null,
    raters: 5,
    items: 11,
    unanimous: false,
    degenerate: null,
  },
  coverage: 1,
  matrix: {},
  solo: [],
  bias: [],
  leaveOneOut: [],
  unanimousGroups: 1,
  raters: ['J1', 'J2'],
  nullTest: { draws: 1000, seed: 1, disruptive: null, harsh: null },
};

const verdict = (judgeKey: string, value: number, p: number) => ({
  judgeKey,
  value,
  p,
  significant: p < 0.05,
});

const cell = (value: number | null, union: number) => ({ value, union });

function mount(agreement: ApiAgreement | null, enabled = true) {
  get.mockResolvedValue({ enabled, agreement });
  return render(<JudgeAgreementPanel versionId="v-1" />, { wrapper });
}

describe('JudgeAgreementPanel', () => {
  beforeEach(() => get.mockReset());

  it('chưa chạy judge ⇒ trạng thái rỗng, không in số nào', async () => {
    mount(null);
    await waitFor(() =>
      expect(screen.getByText('Chưa có số đo')).toBeInTheDocument(),
    );
  });

  it('in κ kèm số judge và số thẻ — κ không so được nếu thiếu hai con số đó', async () => {
    mount({ ...base, matrix: { J1: { J2: cell(0.5, 8) }, J2: { J1: cell(0.5, 8) } } });
    await waitFor(() => expect(screen.getByText('0.420')).toBeInTheDocument());
    expect(screen.getByText(/5 judge · 11 thẻ/)).toBeInTheDocument();
  });

  it('κ null vì NO_VARIANCE ⇒ giải thích là đồng thuận tuyệt đối, KHÔNG in 1.0', async () => {
    mount({
      ...base,
      kappa: { ...base.kappa, kappa: null, reason: 'NO_VARIANCE', unanimous: true },
    });
    await waitFor(() =>
      expect(screen.getByText(/đồng thuận tuyệt đối/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('1.000')).not.toBeInTheDocument();
  });

  it('IDENTICAL_ROWS ⇒ nói rõ không có cấu trúc nào, kèm hằng số −1/(R−1)', async () => {
    mount({
      ...base,
      kappa: { ...base.kappa, kappa: -0.25, degenerate: 'IDENTICAL_ROWS' },
    });
    await waitFor(() =>
      expect(screen.getByText(/không có cấu trúc chồng lấn nào/)).toBeInTheDocument(),
    );
    expect(screen.getByText('-0.25')).toBeInTheDocument();
  });

  it('ô cỡ mẫu nhỏ KHÔNG được chọn làm "cặp trùng nhau nhất"', async () => {
    // Đây là chốt chặn quan trọng nhất của panel: J1-J2 trùng 100% nhưng chỉ 2 mẫu, còn cặp
    // đáng tin là 60% với 9 mẫu. Không có chốt này thì bảng luôn đề cử cặp ngẫu nhiên.
    mount({
      ...base,
      raters: ['J1', 'J2', 'J3'],
      matrix: {
        J1: { J1: cell(1, 2), J2: cell(1, 2), J3: cell(0.6, 9) },
        J2: { J1: cell(1, 2), J2: cell(1, 2), J3: cell(0.1, 9) },
        J3: { J1: cell(0.6, 9), J2: cell(0.1, 9), J3: cell(1, 9) },
      },
    });
    await waitFor(() =>
      expect(screen.getByText(/J1 \+ J3 — 60%/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/J1 \+ J2/)).not.toBeInTheDocument();
  });

  it('số hiện TRONG ô, không chỉ trong title (DESIGN_SYSTEM §6.7)', async () => {
    mount({ ...base, matrix: { J1: { J2: cell(0.5, 8) }, J2: { J1: cell(0.5, 8) } } });
    await waitFor(() => expect(screen.getAllByText('0.50').length).toBeGreaterThan(0));
    expect(screen.getAllByText('n=8').length).toBeGreaterThan(0);
  });

  it('ô cỡ mẫu nhỏ bị LÀM MỜ, ô đủ mẫu và trùng cao thì tô đậm', async () => {
    // Màu ở đây là kênh truyền tin, không phải trang trí: đậm = trùng cao và đủ mẫu, mờ = đừng
    // tin. `status-chip.test.tsx` cũng assert class vì cùng lý do.
    mount({
      ...base,
      raters: ['J1', 'J2'],
      matrix: {
        J1: { J1: cell(1, 9), J2: cell(1, 2) },
        J2: { J1: cell(1, 2), J2: cell(1, 9) },
      },
    });
    await waitFor(() => expect(screen.getAllByText('1.00').length).toBe(4));

    const small = screen.getAllByText('n=2')[0].parentElement;
    const big = screen.getAllByText('n=9')[0].parentElement;
    expect(small).toHaveClass('bg-sunken');
    expect(big).toHaveClass('bg-brand-ink');
  });

  it('cờ tắt ⇒ nói rõ đang tắt, KHÁC với "chưa chạy judge"', async () => {
    mount(null, false);
    await waitFor(() =>
      expect(screen.getByText('Số đo đang tắt')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Chưa có số đo')).not.toBeInTheDocument();
  });

  it('gọi ĐÚNG endpoint — mock trước đây bỏ qua đối số nên sai đường dẫn vẫn xanh', async () => {
    mount(base);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get).toHaveBeenCalledWith('/spec-versions/v-1/judge-agreement');
  });

  it('ba dòng mẫu hình hiện dữ liệu thật, không phải chuỗi dự phòng', async () => {
    // Trước đây `solo`/`bias`/`leaveOneOut` là `[]` trong MỌI test, nên cả ba dòng chỉ từng
    // render chuỗi "không có". Chính ba con số PR đưa ra làm bằng chứng thì không có test nào.
    mount({
      ...base,
      raters: ['J1', 'J5'],
      // Judge thứ hai phải có rate DƯƠNG nhưng thấp hơn: nếu nó là 0 thì chốt `> 0` tự loại
      // và việc lấy phần tử đầu hay cuối cho cùng kết quả — mutation sẽ sống sót.
      solo: [
        { judgeKey: 'J5', solo: 3, raised: 4, rate: 0.75 },
        { judgeKey: 'J3', solo: 1, raised: 4, rate: 0.25 },
      ],
      bias: [
        { judgeKey: 'J4', bias: 1.5, n: 2 },
        { judgeKey: 'J1', bias: -0.05, n: 5 },
      ],
      leaveOneOut: [
        { judgeKey: 'J5', delta: 0.139, kappaWithout: 0.32 },
        { judgeKey: 'J1', delta: -0.02, kappaWithout: 0.16 },
      ],
      nullTest: {
        draws: 1000,
        seed: 1,
        harsh: verdict('J4', 1.5, 0.004),
        disruptive: verdict('J5', 0.139, 0.012),
      },
    });

    await waitFor(() => expect(screen.getByText(/J5 — 75%/)).toBeInTheDocument());
    expect(screen.getByText(/J4 — \+1.50 bậc \(p = 0.004\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/J5 — bỏ ra thì κ tăng 0.139 \(p = 0.012\)/),
    ).toBeInTheDocument();
  });

  it('Δκ dương nhưng p KHÔNG đáng kể ⇒ không nêu tên ai, in p ra', async () => {
    // Chốt chặn quan trọng nhất mới thêm. Đo thật dưới null năm judge giống nhau: dòng
    // "gây nhiễu nhất" bắn 100% lượt, "chấm nặng tay nhất" 98.2%. Không có chốt này thì panel
    // luôn chỉ ra một kẻ có tội, và #8 dồn tài nguyên đắt vào đó.
    mount({
      ...base,
      bias: [{ judgeKey: 'J4', bias: 0.9, n: 3 }],
      leaveOneOut: [{ judgeKey: 'J2', delta: 0.011, kappaWithout: 0.43 }],
      nullTest: {
        draws: 1000,
        seed: 1,
        harsh: verdict('J4', 0.9, 0.412),
        disruptive: verdict('J2', 0.011, 0.868),
      },
    });

    await waitFor(() =>
      expect(screen.getByText('không đáng kể (p = 0.868)')).toBeInTheDocument(),
    );
    expect(screen.getByText('không đáng kể (p = 0.412)')).toBeInTheDocument();
    // Tên judge KHÔNG được xuất hiện ở hai dòng đó.
    expect(screen.queryByText(/J2 — bỏ ra thì/)).not.toBeInTheDocument();
    expect(screen.queryByText(/J4 — \+0.90 bậc/)).not.toBeInTheDocument();
  });

  it('bản ghi CŨ chưa kiểm định ⇒ nói "chưa kiểm định", khác "không đáng kể"', async () => {
    mount({
      ...base,
      leaveOneOut: [{ judgeKey: 'J2', delta: 0.5, kappaWithout: 0.9 }],
      nullTest: { draws: 0, seed: 0, disruptive: null, harsh: null },
    });
    await waitFor(() =>
      expect(screen.getAllByText('chưa kiểm định').length).toBe(2),
    );
    // Δκ = 0.5 rất lớn, nhưng chưa kiểm định thì vẫn KHÔNG được nêu tên.
    // Matcher phải hẹp: `/J2/` trần khớp cả nhãn trục của ma trận.
    expect(screen.queryByText(/J2 — bỏ ra thì/)).not.toBeInTheDocument();
  });

  it('judge NHẸ tay không bị gọi là "chấm nặng tay nhất"', async () => {
    // Chốt dấu nay ở **backend** (`permutationNull` chỉ xét ứng viên `bias > 0`), nên panel chỉ
    // cần không tự bịa ra ứng viên từ `a.bias`. Ca này: `a.bias` có người, `nullTest` không —
    // panel phải im. Đảo lại thì panel đọc `a.bias` và dán nhãn nặng tay cho một judge nhẹ tay.
    mount({
      ...base,
      bias: [{ judgeKey: 'J2', bias: -0.8, n: 4 }],
      leaveOneOut: [{ judgeKey: 'J2', delta: -0.1, kappaWithout: 0.1 }],
      nullTest: { draws: 1000, seed: 1, disruptive: null, harsh: null },
    });
    await waitFor(() => expect(screen.getAllByText('không có').length).toBe(3));
    expect(screen.queryByText(/J2 — /)).not.toBeInTheDocument();
  });

  it('thang nhiệt phân biệt đủ các bậc, không chỉ hai đầu', async () => {
    mount({
      ...base,
      raters: ['J1', 'J2', 'J3', 'J4'],
      matrix: {
        J1: { J2: cell(0.9, 9), J3: cell(0.6, 9), J4: cell(0.3, 9) },
        J2: { J1: cell(0.9, 9) },
        J3: { J1: cell(0.6, 9) },
        J4: { J1: cell(0.3, 9) },
      },
    });
    await waitFor(() => expect(screen.getAllByText('0.90').length).toBeGreaterThan(0));
    expect(screen.getAllByText('0.90')[0].parentElement).toHaveClass('bg-brand-ink');
    expect(screen.getAllByText('0.60')[0].parentElement).toHaveClass('bg-brand-line');
    expect(screen.getAllByText('0.30')[0].parentElement).toHaveClass('bg-brand-soft');
  });

  it('coverage dưới 100% ⇒ nói rõ phần nằm ngoài phép đo', async () => {
    mount({ ...base, coverage: 0.7 });
    await waitFor(() =>
      expect(screen.getByText(/70% issue có gắn thẻ/)).toBeInTheDocument(),
    );
  });
});
