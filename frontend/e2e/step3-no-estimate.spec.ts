import { expect, test } from '@playwright/test';

/**
 * Bước 3 khi **có kế hoạch thí nghiệm nhưng không có ước lượng tài nguyên**.
 *
 * Không phải ca hiếm: `estimator_inputs` hỏi số tham số model và mức lượng tử hoá, nên bất kỳ
 * nghiên cứu nào không chạy trên mô hình — thử nghiệm lâm sàng, khảo sát người dùng — đều rơi vào
 * đây. Backend cố ý bỏ ước lượng và giữ kế hoạch (`generator.service.ts`, `safeParse`).
 *
 * Hai lỗi đã xảy ra thật ở trạng thái này, và đây là test khoá chúng lại:
 *
 * 1. Cột "Kiểm tra tính khả thi" hiện **skeleton vĩnh viễn**. Skeleton nghĩa là *đang tải*; dùng
 *    nó cho một trạng thái đã kết thúc là bắt người dùng chờ một thứ không bao giờ tới.
 * 2. Nặng hơn: khối "Duyệt kế hoạch" khoá sau `has_estimate`, nên người dùng **kẹt vĩnh viễn ở
 *    bước 3** — nút chốt không bao giờ hiện ra.
 *
 * Dùng Playwright chứ không vitest: hai lỗi này chỉ lộ ra khi cả trang dựng xong với dữ liệu
 * thật chảy qua TanStack Query. Test component sẽ phải mock đúng những hook mà lỗi nằm ở giữa.
 */
type Status = 'NOT_APPLICABLE' | 'INVALID_PARAMS' | undefined;

test.describe('Bước 3 · có kế hoạch, không có ước lượng', () => {
  /** Dựng đúng một trạng thái server. `runningJob` mô phỏng job còn sống sau khi tải lại trang. */
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
              message: 'Đang ước lượng tài nguyên…',
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

      // Kế hoạch CÓ, ước lượng KHÔNG — đúng thứ backend trả cho một RCT y khoa.
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
                  ? 'Nút thắt là tuyển người tham gia, không phải tính toán.'
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

  test('NOT_APPLICABLE: khẳng định kế hoạch không chạy trên mô hình, kèm lý do của model', async ({ page }) => {
    await mock(page, { status: 'NOT_APPLICABLE' });
    await page.goto('/projects/p-1/step/3');

    const panel = page.locator('section').filter({ hasText: 'Kiểm tra tính khả thi' });
    await expect(panel.getByText(/không chạy trên mô hình nào/)).toBeVisible();
    await expect(panel.getByText(/tuyển người tham gia/)).toBeVisible();
    // Không mời tự nhập: ở ca này con số không tồn tại để mà nhập.
    await expect(panel.getByRole('button', { name: 'Tự nhập tham số ước lượng' })).toHaveCount(0);
    await expect(panel.locator('.animate-pulse')).toHaveCount(0);
  });

  test('INVALID_PARAMS: nói tham số hỏng và MỜI tự nhập, không đổ cho "không tính toán"', async ({ page }) => {
    await mock(page, { status: 'INVALID_PARAMS' });
    await page.goto('/projects/p-1/step/3');

    const panel = page.locator('section').filter({ hasText: 'Kiểm tra tính khả thi' });
    await expect(panel.getByText(/tham số ước lượng hệ thống nhận được\s+không hợp lệ/)).toBeVisible();
    await expect(panel.getByText(/không chạy trên mô hình nào/)).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Tự nhập tham số ước lượng' })).toBeVisible();
  });

  test('form tự nhập mở ra là dùng được bằng bàn phím', async ({ page }) => {
    await mock(page, { status: 'INVALID_PARAMS' });
    await page.goto('/projects/p-1/step/3');

    await page.getByRole('button', { name: 'Tự nhập tham số ước lượng' }).click();
    await expect(page.getByLabel('Cỡ model (tỉ tham số)')).toHaveAttribute('type', 'range');
    await expect(page.getByRole('button', { name: 'Lưu ước lượng' })).toBeVisible();
  });

  /**
   * Ca mà bản vá đầu tiên nói dối: trạng thái chưa được ghi (hàng cũ), hoặc job còn chạy mà
   * trang vừa tải lại nên client mất dấu nó. Không được khẳng định bất cứ điều gì.
   */
  test('trạng thái chưa rõ: KHÔNG khẳng định, mà nói có thể đang tính', async ({ page }) => {
    await mock(page, { status: undefined });
    await page.goto('/projects/p-1/step/3');

    const panel = page.locator('section').filter({ hasText: 'Kiểm tra tính khả thi' });
    await expect(panel.getByText(/hệ thống có thể đang tính/)).toBeVisible();
    await expect(panel.getByText(/không chạy trên mô hình nào/)).toHaveCount(0);
  });

  test('vẫn chốt được kế hoạch — không kẹt ở bước 3', async ({ page }) => {
    await mock(page, { status: 'NOT_APPLICABLE' });
    await page.goto('/projects/p-1/step/3');

    await expect(page.getByRole('button', { name: 'Chốt kế hoạch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Duyệt kế hoạch' })).toBeVisible();
  });

  test('kế hoạch thí nghiệm vẫn hiện đầy đủ, không bị mất theo ước lượng', async ({ page }) => {
    await mock(page, { status: 'NOT_APPLICABLE' });
    await page.goto('/projects/p-1/step/3');
    await expect(page.getByText(/Mindfulness meditation vs sleep hygiene education/)).toBeVisible();
  });
});
