import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` được nâng lên đầu file, nên factory không đọc được `const` khai ở thân file.
// `vi.hoisted` là chỗ duy nhất khai được biến mà factory nhìn thấy.
const { get, replace } = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, get } };
});

import AuthLayout from './layout';

/**
 * Chiều **ra** của bảo vệ route (#25). Ba hành vi đáng test, và cả ba đều là thứ đã hỏng hoặc
 * suýt hỏng: đá người đã đăng nhập ra, giữ nguyên form cho người chưa đăng nhập, và **không
 * chớp form** trong lúc chờ — cái cuối là lý do layout này tồn tại thay vì một `useEffect` trần.
 */
function renderLayout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AuthLayout>
    <form data-testid="auth-form">form đăng nhập</form>
  </AuthLayout>, { wrapper });
}

describe('(auth)/layout — chặn người đã đăng nhập', () => {
  beforeEach(() => {
    replace.mockClear();
    get.mockReset();
  });

  it('đã có phiên ⇒ chuyển về / và không render form', async () => {
    get.mockResolvedValue({ user: { id: 'u1' } });
    renderLayout();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument();
  });

  it('chưa đăng nhập ⇒ render form và KHÔNG chuyển hướng', async () => {
    get.mockRejectedValue(new Error('401'));
    renderLayout();

    await waitFor(() =>
      expect(screen.getByTestId('auth-form')).toBeInTheDocument(),
    );
    // Không vòng lặp chuyển hướng — tiêu chí hoàn thành của #25.
    expect(replace).not.toHaveBeenCalled();
  });

  it('đang chờ /auth/me ⇒ không chớp form dù chỉ một khung hình', () => {
    // Promise không bao giờ resolve: giữ component đứng yên ở trạng thái đang tải.
    get.mockReturnValue(new Promise(() => {}));
    renderLayout();

    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
