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
test.describe('Bước 3 · có kế hoạch, không có ước lượng', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', (route) => {
      const url = route.request().url();

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
              // Đây là trường then chốt của cả bài test.
              has_estimate: false,
              meta: null,
            },
            source_count: 0,
          },
        });
      }

      return route.fulfill({ status: 200, json: {} });
    });
  });

  test('nói rõ vì sao không có ước lượng, KHÔNG treo skeleton', async ({ page }) => {
    await page.goto('/projects/p-1/step/3');

    /* Khoanh vùng vào đúng panel đang xét. Đếm `.animate-pulse` trên cả trang thì bắt nhầm
       skeleton thoáng qua của panel khác lúc trang còn đang dựng — test sẽ đỏ ngẫu nhiên khi
       máy chậm, và đỏ vì lý do không liên quan tới thứ nó muốn kiểm. */
    const panel = page.locator('section').filter({ hasText: 'Kiểm tra tính khả thi' });
    await expect(
      panel.getByText(/Kế hoạch này không có phần tính toán để ước lượng/),
    ).toBeVisible();
    await expect(panel.locator('.animate-pulse')).toHaveCount(0);
  });

  test('vẫn chốt được kế hoạch — không kẹt ở bước 3', async ({ page }) => {
    await page.goto('/projects/p-1/step/3');

    // Tra theo vai trò, không theo chữ: "Duyệt kế hoạch" xuất hiện ở cả tiêu đề panel lẫn nhãn
    // phương án. Nút gửi là bằng chứng đủ và duy nhất rằng khối quyết định đã dựng xong.
    await expect(page.getByRole('button', { name: 'Chốt kế hoạch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Duyệt kế hoạch' })).toBeVisible();
  });

  test('kế hoạch thí nghiệm vẫn hiện đầy đủ, không bị mất theo ước lượng', async ({ page }) => {
    await page.goto('/projects/p-1/step/3');
    await expect(page.getByText(/Mindfulness meditation vs sleep hygiene education/)).toBeVisible();
  });
});
