import { expect, test } from '@playwright/test';

test.describe('End-to-End Research Spec Journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('redirects unauthenticated user from protected dashboard to login', async ({ page }) => {
    // The real path is `/api/auth/me` (`apiUrl('/auth/me')`), not `/api/me`.
    // A wrong match lets the request escape the mock and the test passes for the wrong reason.
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } }),
    );

    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });

  test('completes full user journey: registration -> homepage -> project creation -> step wizard & decision selection', async ({ page, context }) => {
    let authenticated = false;
    await context.clearCookies();

    // Single unified API route handler to avoid URL regex ordering bugs
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes('/api/auth/register')) {
        authenticated = true;
        return route.fulfill({
          status: 200,
          headers: { 'Set-Cookie': 'access_token=fake-jwt; Path=/; HttpOnly' },
          json: {
            user: { id: 'u-1', email: 'user@example.com', display_name: 'Dr. Test User' },
            tokens: { access: 'fake-jwt', refresh: 'fake-refresh' },
          },
        });
      }

      // `/api/auth/me`, not `/api/me` — this used to miss, so every `/auth/me` call fell through
      // to the catch-all `{ status: 200, json: {} }` at the end, i.e. it **always** looked signed
      // in. `(app)/layout.tsx` passed by accident; `(auth)/layout.tsx` read that fake "success"
      // and bounced the visitor off `/register`.
      if (url.includes('/api/auth/me')) {
        if (!authenticated) {
          return route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } });
        }
        return route.fulfill({
          status: 200,
          json: { user: { id: 'u-1', email: 'user@example.com', display_name: 'Dr. Test User' } },
        });
      }

      if (url.includes('/api/projects/p-101/pending-decisions') || url.includes('/api/projects/p-101/decisions')) {
        return route.fulfill({
          status: 200,
          json: {
            decisions: [
              {
                id: 'd-1',
                step: 'S1',
                question: 'Confirm the scope of the multimodal system',
                options: [
                  { key: 'A', label: 'Buses + light rail', explain: 'Urban scope', recommended: true },
                  { key: 'B', label: 'Buses only', explain: 'Narrow scope' },
                ],
                chosen_key: '',
              },
            ],
          },
        });
      }

      if (url.includes('/api/projects/p-101')) {
        return route.fulfill({
          status: 200,
          json: {
            project: {
              id: 'p-101',
              title: 'Multimodal Bus Booking Spec',
              raw_idea: 'Detailed research idea about multimodal transportation algorithms.',
              step: 'S1',
              status: 'DRAFT',
              arm: 'STANDARD',
              verifier_gate: true,
              current_spec_version_id: 'v-101',
            },
            currentVersion: {
              id: 'v-101',
              version_no: 1,
              status: 'DRAFT',
              card_count: 2,
              related_work_count: 1,
              issue_group_count: 0,
              meta: {
                paraphrase_en: 'Research spec for multimodal route optimization algorithm.',
                paraphrase_vi: 'Research spec for a multimodal route optimization algorithm.',
                confidence: 'HIGH',
                key_problems: ['Optimal routing under traffic delays'],
                topics: ['Algorithms', 'Transportation'],
                search_keywords: ['multimodal routing', 'bus optimization'],
              },
            },
            source_count: 3,
          },
        });
      }

      if (url.includes('/api/projects') && method === 'POST') {
        return route.fulfill({
          status: 201,
          json: {
            project: {
              id: 'p-101',
              title: 'Multimodal Bus Booking Spec',
              raw_idea: 'Detailed research idea about multimodal transportation algorithms.',
              step: 'S1',
              status: 'DRAFT',
              arm: 'STANDARD',
              created_at: new Date().toISOString(),
            },
          },
        });
      }

      if (url.includes('/api/projects')) {
        return route.fulfill({
          status: 200,
          json: {
            projects: [
              {
                id: 'p-101',
                title: 'Multimodal Bus Booking Spec',
                raw_idea: 'Detailed research idea about multimodal transportation algorithms.',
                step: 'S1',
                status: 'DRAFT',
                updated_at: new Date().toISOString(),
              },
            ],
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
                type: 'PROBLEM',
                // `UNVERIFIED` is not one of the 6 `CardStatus` values; the backend never returns
                // it. `PROPOSED` is the real status of a freshly generated, unconfirmed card.
                status: 'PROPOSED',
                title: 'Problem Definition',
                body: 'Routing delay problem under uncertain traffic patterns.',
                card_sources: [],
              },
              {
                id: 'c-2',
                // `PROPOSED_APPROACH` is not one of the 8 `CardType` values. In this system a
                // "proposed approach" is a `CONTRIBUTION` card carrying `payload.role`
                // (`spec.types.ts:23-27`) — the 8-type enum does not stretch for a presentation slot.
                type: 'CONTRIBUTION',
                status: 'CONFIRMED',
                title: 'Proposed Heuristic Model',
                body: 'Dynamic programming combined with heuristic search.',
                card_sources: [],
              },
            ],
          },
        });
      }

      return route.fulfill({ status: 200, json: {} });
    });

    // 2. Visit Register Page and Submit Form
    await page.goto('/register');
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

    await page.getByLabel('Display name').fill('Dr. Test User');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();

    // 3. Authenticated Redirect to Homepage (/)
    await expect(page).toHaveURL('http://localhost:3111/');
    await expect(page.getByRole('heading', { name: /start from an idea/i })).toBeVisible();

    // 4. Input Research Idea & Create Project
    const textarea = page.getByRole('textbox');
    await textarea.fill('Detailed research idea about multimodal transportation algorithms for city buses.');
    await page.getByRole('button', { name: /analyse idea/i }).click();

    // 5. Land on Project Step Wizard (/projects/p-101/step/1)
    await expect(page).toHaveURL(/\/projects\/p-101\/step\//);

    // 6. Verify Project Title Renders on Step Page
    await expect(page.getByText('Multimodal Bus Booking Spec')).toBeVisible();

    // 7. Verify & Interact with Decision Question Option List
    await expect(page.getByText('Confirm the scope of the multimodal system')).toBeVisible();
    const optionRadio = page.getByRole('radio', { name: /buses \+ light rail/i });
    await expect(optionRadio).toBeVisible();
    await optionRadio.click();
    await page.getByRole('button', { name: 'Confirm choice' }).click();
  });
});
