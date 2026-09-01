import { expect, test } from '@playwright/test';

/**
 * Step 3 when there **is an experiment plan but no resource estimate**.
 *
 * Not a rare case: `estimator_inputs` asks for the model parameter count and the quantisation
 * level, so any study that does not run on a model — a clinical trial, a user survey — lands here.
 * The backend deliberately drops the estimate and keeps the plan (`generator.service.ts`,
 * `safeParse`).
 *
 * Two real bugs occurred in this state, and this test locks them out:
 *
 * 1. The "Feasibility check" column showed a **permanent skeleton**. A skeleton means *loading*;
 *    using it for a finished state makes the user wait for something that never arrives.
 * 2. Worse: the "Approve the plan" block was gated behind `has_estimate`, so the user was **stuck
 *    at step 3 forever** — the confirm button never appeared.
 *
 * Playwright rather than vitest: both bugs only surface once the whole page renders with real data
 * flowing through TanStack Query. A component test would have to mock exactly the hooks the bugs
 * live between.
 */
type Status = 'NOT_APPLICABLE' | 'INVALID_PARAMS' | undefined;

test.describe('Step 3 · a plan with no estimate', () => {
  /** Builds exactly one server state. `runningJob` simulates a job still alive after a page reload. */
  async function mock(
    page: import('@playwright/test').Page,
    opts: { status: Status; runningJob?: boolean },
  ) {
    await page.route('**/api/**', (route) => {
      const url = route.request().url();

      if (url.includes('/api/jobs/')) {
        return route.fulfill({
          status: 200,
          json: {
            job: {
              id: 'j-1',
              kind: 'GENERATE',
              status: opts.runningJob ? 'RUNNING' : 'DONE',
              progress: { done: 1, total: 2 },
              message: 'Estimating resources…',
              error_code: null,
            },
          },
        });
      }

      if (url.includes('/api/auth/me')) {
        return route.fulfill({
          status: 200,
          json: { user: { id: 'u-1', email: 'u@e.com', display_name: 'Test User' } },
        });
      }

      // Plan YES, estimate NO — exactly what the backend returns for a medical RCT.
      if (url.includes('/plan')) {
        return route.fulfill({
          status: 200,
          json: {
            plan: {
              experiments: [
                {
                  code: 'TN1',
                  title: 'Mindfulness meditation vs sleep hygiene education',
                  bullets: ['On 200 community-dwelling adults aged 60+'],
                  linked_claim_title: 'Mindfulness improves subjective sleep quality',
                },
              ],
              baselines_and_metrics: 'PSQI global score',
              ablation_plan: '—',
              risks_and_limitations: '—',
              estimate_status: opts.status,
              estimate_note:
                opts.status === 'NOT_APPLICABLE'
                  ? 'The bottleneck is participant recruitment, not computation.'
                  : undefined,
            },
            estimate: null,
          },
        });
      }

      if (url.includes('/cards')) {
        return route.fulfill({
          status: 200,
          json: {
            cards: [
              {
                id: 'c-1',
                type: 'CLAIM',
                status: 'PROPOSED',
                title: 'Mindfulness improves subjective sleep quality',
                body: 'Body',
                payload: null,
                order_index: 0,
                origin: 'GENERATOR',
                card_sources: [],
              },
            ],
          },
        });
      }

      if (url.includes('/pending-decisions') || url.includes('/decisions')) {
        return route.fulfill({ status: 200, json: { decisions: [] } });
      }

      if (url.includes('/api/projects/p-1')) {
        return route.fulfill({
          status: 200,
          json: {
            project: {
              id: 'p-1',
              title: 'Improving Sleep in Older Adults',
              raw_idea: 'Sleep interventions for older adults.',
              step: 'S3',
              status: 'DRAFT',
              arm: 'STANDARD',
              verifier_gate: true,
              current_spec_version_id: 'v-1',
            },
            currentVersion: {
              id: 'v-1',
              version_no: 1,
              status: 'DRAFT',
              card_count: 1,
              related_work_count: 0,
              issue_group_count: 0,
              has_experiment_plan: true,
              has_estimate: false,
              meta: null,
            },
            source_count: 0,
          },
        });
      }

      return route.fulfill({ status: 200, json: {} });
    });
  }

  test('NOT_APPLICABLE: states the plan runs on no model, with the model reason', async ({ page }) => {
    await mock(page, { status: 'NOT_APPLICABLE' });
    await page.goto('/projects/p-1/step/3');

    const panel = page.locator('section').filter({ hasText: 'Feasibility check' });
    await expect(panel.getByText(/does not run on any model/)).toBeVisible();
    await expect(panel.getByText(/participant recruitment/)).toBeVisible();
    // No invitation to enter values: in this case the number does not exist to be entered.
    await expect(
      panel.getByRole('button', { name: 'Enter the estimate parameters yourself' }),
    ).toHaveCount(0);
    await expect(panel.locator('.animate-pulse')).toHaveCount(0);
  });

  test('INVALID_PARAMS: names the broken parameters and INVITES manual entry, never blames "no computation"', async ({ page }) => {
    await mock(page, { status: 'INVALID_PARAMS' });
    await page.goto('/projects/p-1/step/3');

    const panel = page.locator('section').filter({ hasText: 'Feasibility check' });
    await expect(panel.getByText(/estimator parameters the system received are\s+not valid/)).toBeVisible();
    await expect(panel.getByText(/does not run on any model/)).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: 'Enter the estimate parameters yourself' }),
    ).toBeVisible();
  });

  test('the manual form is keyboard usable once opened', async ({ page }) => {
    await mock(page, { status: 'INVALID_PARAMS' });
    await page.goto('/projects/p-1/step/3');

    await page.getByRole('button', { name: 'Enter the estimate parameters yourself' }).click();
    await expect(page.getByLabel('Model size (billion parameters)')).toHaveAttribute('type', 'range');
    await expect(page.getByRole('button', { name: 'Save estimate' })).toBeVisible();
  });

  /**
   * The case the first patch lied about: the status was never written (an old row), or the job is
   * still running and the page reloaded so the client lost track of it. Assert nothing here.
   */
  test('unknown status: asserts NOTHING, only that it may still be computing', async ({ page }) => {
    await mock(page, { status: undefined });
    await page.goto('/projects/p-1/step/3');

    const panel = page.locator('section').filter({ hasText: 'Feasibility check' });
    await expect(panel.getByText(/may still be\s+computing it/)).toBeVisible();
    await expect(panel.getByText(/does not run on any model/)).toHaveCount(0);
  });

  test('the plan can still be settled — no dead end at step 3', async ({ page }) => {
    await mock(page, { status: 'NOT_APPLICABLE' });
    await page.goto('/projects/p-1/step/3');

    await expect(page.getByRole('button', { name: 'Settle the plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Approve the plan' })).toBeVisible();
  });

  test('the experiment plan still renders in full, not lost along with the estimate', async ({ page }) => {
    await mock(page, { status: 'NOT_APPLICABLE' });
    await page.goto('/projects/p-1/step/3');
    await expect(page.getByText(/Mindfulness meditation vs sleep hygiene education/)).toBeVisible();
  });
});
