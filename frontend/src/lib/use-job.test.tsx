import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` is hoisted to the top of the file, so its factory cannot see a `const` declared below.
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

// `EventSource` does not exist in jsdom. `useJob` opens one in an effect, and SSE is only an
// accelerator — the source of truth is polling `GET /jobs/:id`. A no-op stub lets the effect run.
class FakeEventSource {
  addEventListener() {}
  close() {}
  onmessage: unknown = null;
  onerror: unknown = null;
}
vi.stubGlobal('EventSource', FakeEventSource);

import { useJobAction } from './use-project';

/**
 * #28 — a finished job must **announce itself**, because `JobProgress` sits at the top of the
 * middle column while what just changed (the three comment columns of the related-work table) is
 * further down the screen.
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

describe('useJobAction — announcing the result when a job finishes (#28)', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    success.mockReset();
    error.mockReset();
  });

  it('backend done ⇒ a success toast with the exact sentence the backend returned', async () => {
    post.mockResolvedValue({ jobId: 'j-1' });
    get.mockResolvedValue(
      job({ status: 'DONE', message: 'Built 12 related-work rows.' }),
    );

    const { result } = renderHook(() => useJobAction('p-1'), { wrapper });
    result.current.run('/projects/p-1/related-work');

    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        'Built 12 related-work rows.',
      ),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('backend failed ⇒ an error toast mapped from error_code', async () => {
    post.mockResolvedValue({ jobId: 'j-1' });
    get.mockResolvedValue(
      job({ status: 'FAILED', error_code: 'NO_SOURCES_YET', message: null }),
    );

    const { result } = renderHook(() => useJobAction('p-1'), { wrapper });
    result.current.run('/projects/p-1/related-work');

    await waitFor(() => expect(error).toHaveBeenCalled());
    // Mapped through `error-code.ts`, not copied from the backend `message`.
    expect(String(error.mock.calls[0][0])).not.toBe('');
    expect(success).not.toHaveBeenCalled();
  });

  it('announces nothing while the job is still running', async () => {
    post.mockResolvedValue({ jobId: 'j-1' });
    get.mockResolvedValue(job({ status: 'RUNNING', message: 'Running…' }));

    const { result } = renderHook(() => useJobAction('p-1'), { wrapper });
    result.current.run('/projects/p-1/related-work');

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('announces a job exactly once no matter how often it re-renders', async () => {
    post.mockResolvedValue({ jobId: 'j-1' });
    get.mockResolvedValue(job({ status: 'DONE', message: 'All done.' }));

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
