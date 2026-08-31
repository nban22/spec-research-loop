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
};

const cell = (value: number | null, union: number) => ({ value, union });

function mount(agreement: ApiAgreement | null) {
  get.mockResolvedValue({ agreement });
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

  it('UNIFORM_MARGINALS ⇒ nói rõ không có cấu trúc nào, kèm hằng số −1/(R−1)', async () => {
    mount({
      ...base,
      kappa: { ...base.kappa, kappa: -0.25, degenerate: 'UNIFORM_MARGINALS' },
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

  it('coverage dưới 100% ⇒ nói rõ phần nằm ngoài phép đo', async () => {
    mount({ ...base, coverage: 0.7 });
    await waitFor(() =>
      expect(screen.getByText(/70% issue có gắn thẻ/)).toBeInTheDocument(),
    );
  });
});
