import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` bị nâng lên đầu file nên factory không thấy `const` khai ở thân file.
const { get, post, success, error } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success, error } }));
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, api: { ...actual.api, get, post } };
});

// `EventSource` không tồn tại trong jsdom. `useJob` mở một cái ở effect, và SSE chỉ là đường
// tăng tốc — nguồn sự thật là poll `GET /jobs/:id`. Thay bằng bản rỗng để effect chạy được.
class FakeEventSource {
  addEventListener() {}
  close() {}
  onmessage: unknown = null;
  onerror: unknown = null;
}
vi.stubGlobal('EventSource', FakeEventSource);

import { useJobAction } from './use-project';

/**
 * #28 — job xong phải **tự báo**, vì `JobProgress` nằm trên cùng cột giữa còn thứ vừa đổi
 * (ba cột nhận xét của bảng nghiên cứu liên quan) nằm dưới màn hình.
 */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function job(over: Record<string, unknown>) {
  return {
    job: {
      id: 'j-1',
      kind: 'GENERATE',
      status: 'DONE',
      progress: { done: 1, total: 1 },
      message: null,
      error_code: null,
      ...over,
    },
  };
}

describe('useJobAction — báo kết quả khi job về đích (#28)', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    success.mockReset();
    error.mockReset();
  });

  it('backend xong ⇒ toast thành công đúng câu backend trả về', async () => {
    post.mockResolvedValue({ jobId: 'j-1' });
    get.mockResolvedValue(
      job({ status: 'DONE', message: 'Đã dựng 12 dòng nghiên cứu liên quan.' }),
    );

    const { result } = renderHook(() => useJobAction('p-1'), { wrapper });
    result.current.run('/projects/p-1/related-work');

    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        'Đã dựng 12 dòng nghiên cứu liên quan.',
      ),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('backend hỏng ⇒ toast lỗi tiếng Việt ánh xạ từ error_code', async () => {
    post.mockResolvedValue({ jobId: 'j-1' });
    get.mockResolvedValue(
      job({ status: 'FAILED', error_code: 'NO_SOURCES_YET', message: null }),
    );

    const { result } = renderHook(() => useJobAction('p-1'), { wrapper });
    result.current.run('/projects/p-1/related-work');

    await waitFor(() => expect(error).toHaveBeenCalled());
    // Ánh xạ qua `error-code.ts`, không phải chép `message` của backend.
    expect(String(error.mock.calls[0][0])).not.toBe('');
    expect(success).not.toHaveBeenCalled();
  });

  it('job chưa xong thì chưa báo gì', async () => {
    post.mockResolvedValue({ jobId: 'j-1' });
    get.mockResolvedValue(job({ status: 'RUNNING', message: 'Đang chạy…' }));

    const { result } = renderHook(() => useJobAction('p-1'), { wrapper });
    result.current.run('/projects/p-1/related-work');

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('một job chỉ báo đúng một lần dù render lại nhiều lần', async () => {
    post.mockResolvedValue({ jobId: 'j-1' });
    get.mockResolvedValue(job({ status: 'DONE', message: 'Đã xong việc.' }));

    const { result, rerender } = renderHook(() => useJobAction('p-1'), {
      wrapper,
    });
    result.current.run('/projects/p-1/gap');

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(success).toHaveBeenCalledTimes(1);
  });
});
