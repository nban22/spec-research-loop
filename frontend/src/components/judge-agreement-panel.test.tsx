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
 * #9 — the disagreement metrics. Three behaviours worth pinning down, all easy to misread:
 * a degenerate κ must be explained rather than printed, small-sample Jaccard cells must be excluded
 * from any conclusion, and the number must appear in the cell rather than only in `title`.
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

function mount(agreement: ApiAgreement | null) {
  get.mockResolvedValue({ agreement });
  return render(<JudgeAgreementPanel versionId="v-1" />, { wrapper });
}

describe('JudgeAgreementPanel', () => {
  beforeEach(() => get.mockReset());

  it('no judge round yet ⇒ the empty state, with no number printed', async () => {
    mount(null);
    await waitFor(() =>
      expect(screen.getByText('No metrics yet')).toBeInTheDocument(),
    );
  });

  it('prints κ with the judge and card counts — κ is not comparable without them', async () => {
    mount({ ...base, matrix: { J1: { J2: cell(0.5, 8) }, J2: { J1: cell(0.5, 8) } } });
    await waitFor(() => expect(screen.getByText('0.420')).toBeInTheDocument());
    expect(screen.getByText(/5 judges · 11 cards/)).toBeInTheDocument();
  });

  it('κ null from NO_VARIANCE ⇒ explains it as perfect agreement, NOT a printed 1.0', async () => {
    mount({
      ...base,
      kappa: { ...base.kappa, kappa: null, reason: 'NO_VARIANCE', unanimous: true },
    });
    await waitFor(() =>
      expect(screen.getByText(/perfect agreement/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('1.000')).not.toBeInTheDocument();
  });

  it('IDENTICAL_ROWS ⇒ says there is no structure, alongside the −1/(R−1) constant', async () => {
    mount({
      ...base,
      kappa: { ...base.kappa, kappa: -0.25, degenerate: 'IDENTICAL_ROWS' },
    });
    await waitFor(() =>
      expect(screen.getByText(/there is no overlap structure/)).toBeInTheDocument(),
    );
    expect(screen.getByText('-0.25')).toBeInTheDocument();
  });

  it('never picks a small-sample cell as the "most overlapping pair"', async () => {
    // The panel's most important guard: J1-J2 overlap 100% on only 2 samples, while the
    // trustworthy pair is 60% on 9. Without this guard the table always nominates noise.
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

  it('puts the number IN the cell, not only in the title (DESIGN_SYSTEM §6.7)', async () => {
    mount({ ...base, matrix: { J1: { J2: cell(0.5, 8) }, J2: { J1: cell(0.5, 8) } } });
    await waitFor(() => expect(screen.getAllByText('0.50').length).toBeGreaterThan(0));
    expect(screen.getAllByText('n=8').length).toBeGreaterThan(0);
  });

  it('DIMS a small-sample cell and darkens a well-sampled, high-overlap one', async () => {
    // Colour is an information channel here, not decoration: dark = high overlap with enough
    // samples, dim = do not trust it. `status-chip.test.tsx` asserts classes for the same reason.
    // Both cells carry the **same 1.00 value** and differ only in union size — so any colour
    // difference can only come from the sample size. An earlier version used a diagonal cell as
    // the "well-sampled" one, but the diagonal is a judge against itself: always 1.00, so it
    // isolates no effect at all.
    mount({
      ...base,
      raters: ['J1', 'J2', 'J3'],
      matrix: {
        J1: { J2: cell(1, 9), J3: cell(1, 2) },
        J2: { J1: cell(1, 9), J3: cell(0.1, 9) },
        J3: { J1: cell(1, 2), J2: cell(0.1, 9) },
      },
    });
    await waitFor(() => expect(screen.getAllByText('1.00').length).toBe(4));

    const small = screen.getAllByText('n=2')[0].parentElement;
    const big = screen.getAllByText('n=9')[0].parentElement;
    expect(small).toHaveClass('bg-sunken');
    expect(big).toHaveClass('bg-brand-ink');
  });

  it('keeps the diagonal NEUTRAL — no number, no heat colour, no n', async () => {
    // A judge against itself is 1.00 by definition. Painting it the darkest step adds noise to the
    // very channel carrying the information: when J1 and J2 genuinely overlap, the screen shows a
    // dark 2×2 block and the reader cannot tell which cell means anything. Worse, the diagonal of a
    // judge who raised few groups gets DIMMED, so the same meaningless cell is drawn in two
    // different colours depending on the data.
    mount({
      ...base,
      raters: ['J1', 'J2'],
      matrix: {
        J1: { J1: cell(1, 9), J2: cell(0.9, 9) },
        J2: { J1: cell(0.9, 9), J2: cell(1, 3) },
      },
    });
    await waitFor(() => expect(screen.getAllByText('0.90').length).toBe(2));

    // Only the two off-diagonal cells carry a number and an n; the diagonals show '—' and no n.
    expect(screen.getAllByText('n=9').length).toBe(2);
    expect(screen.queryByText('n=3')).not.toBeInTheDocument();
    expect(screen.queryByText('1.00')).not.toBeInTheDocument();
    const diag = screen.getAllByText('—');
    expect(diag.length).toBe(2);
    expect(diag[0].parentElement).toHaveClass('bg-canvas');
    expect(diag[0].parentElement).not.toHaveClass('bg-brand-ink');
  });

  it('MALFORMED_COUNTS ⇒ says it is a DATA ERROR, never "no cards yet"', async () => {
    // The backend emits this reason and the service zod lets it through, but the frontend type
    // once MISSED it and the panel used a `? :` chain ending in a bare `else` — so it rendered
    // "No cards to measure yet". That statement is false and hides exactly the data-integrity
    // problem this guard exists to surface.
    mount({
      ...base,
      kappa: { ...base.kappa, kappa: null, reason: 'MALFORMED_COUNTS' },
    });
    await waitFor(() =>
      expect(screen.getByText(/malformed, so the measurement stopped/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/No cards to measure yet/)).not.toBeInTheDocument();
  });

  it('NO_ITEMS still gets its own sentence', async () => {
    // This used to be the `else` branch, so it passed even when the reason was something else.
    mount({ ...base, kappa: { ...base.kappa, kappa: null, reason: 'NO_ITEMS' } });
    await waitFor(() =>
      expect(screen.getByText('No cards to measure yet.')).toBeInTheDocument(),
    );
  });

  it('calls the RIGHT endpoint — the old mock ignored its argument, so a wrong path still passed', async () => {
    mount(base);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get).toHaveBeenCalledWith('/spec-versions/v-1/judge-agreement');
  });

  it('renders real data in the three pattern rows, not the fallback strings', async () => {
    // `solo`/`bias`/`leaveOneOut` used to be `[]` in EVERY test, so all three rows only ever
    // rendered the "none" string. The very three numbers the PR offered as evidence had no test.
    mount({
      ...base,
      raters: ['J1', 'J5'],
      // The second judge must have a POSITIVE but lower rate: at 0 the `> 0` guard filters it out
      // and picking the first or last element gives the same answer — a mutation would survive.
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
    expect(screen.getByText(/J4 — \+1.50 severity steps \(p = 0.004\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/J5 — removing them raises κ by 0.139 \(p = 0.012\)/),
    ).toBeInTheDocument();
  });

  it('positive Δκ but a NON-significant p ⇒ names nobody and prints p', async () => {
    // The most important guard added here. Measured under a null where the five judges are
    // identical: the "most disruptive" row fired on 100% of draws, "harshest scorer" on 98.2%.
    // Without this guard the panel always names a culprit, and #8 pours resources at them.
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
      expect(screen.getByText('not significant (p = 0.868)')).toBeInTheDocument(),
    );
    expect(screen.getByText('not significant (p = 0.412)')).toBeInTheDocument();
    // The judge name must NOT appear on either row.
    expect(screen.queryByText(/J2 — removing them/)).not.toBeInTheDocument();
    expect(screen.queryByText(/J4 — \+0.90 severity/)).not.toBeInTheDocument();
  });

  it('an OLD record with no null test ⇒ says "not tested", distinct from "not significant"', async () => {
    mount({
      ...base,
      leaveOneOut: [{ judgeKey: 'J2', delta: 0.5, kappaWithout: 0.9 }],
      nullTest: { draws: 0, seed: 0, disruptive: null, harsh: null },
    });
    await waitFor(() =>
      expect(screen.getAllByText('not tested').length).toBe(2),
    );
    // Δκ = 0.5 is very large, but with no null test the name still must NOT appear.
    // The matcher has to be narrow: a bare `/J2/` also matches the matrix axis labels.
    expect(screen.queryByText(/J2 — removing them/)).not.toBeInTheDocument();
  });

  it('never calls a LENIENT judge the "harshest scorer"', async () => {
    // The sign guard now lives in the **backend** (`permutationNull` only considers `bias > 0`
    // candidates), so the panel merely has to avoid inventing a candidate from `a.bias`. Here
    // `a.bias` has someone and `nullTest` does not — the panel must stay silent. Reversed, the
    // panel would read `a.bias` and label a lenient judge as harsh.
    mount({
      ...base,
      bias: [{ judgeKey: 'J2', bias: -0.8, n: 4 }],
      leaveOneOut: [{ judgeKey: 'J2', delta: -0.1, kappaWithout: 0.1 }],
      nullTest: { draws: 1000, seed: 1, disruptive: null, harsh: null },
    });
    await waitFor(() => expect(screen.getAllByText('none').length).toBe(3));
    expect(screen.queryByText(/J2 — /)).not.toBeInTheDocument();
  });

  it('distinguishes every heat step, not just the two extremes', async () => {
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

  it('coverage below 100% ⇒ states what falls outside the measurement', async () => {
    mount({ ...base, coverage: 0.7 });
    await waitFor(() =>
      expect(screen.getByText(/70% of issues are attached to a card/)).toBeInTheDocument(),
    );
  });
});
