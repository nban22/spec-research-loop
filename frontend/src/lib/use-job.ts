'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, apiUrl, qk } from './api';
import type { ApiJob } from './types';

export type JobView = {
  job: ApiJob | null;
  elapsedMs: number;
  connectionLost: boolean;
  isRunning: boolean;
};

/**
 * Theo dõi một job nền.
 *
 * **SSE là đường tăng tốc, không phải nguồn sự thật** (SYSTEM_DESIGN_ANALYSIS S5 · F.8):
 * trạng thái sống trong TanStack Query của `GET /jobs/:id`; `EventSource` chỉ *đẩy* cập nhật
 * vào đó. Mất kết nối thì poll vẫn chạy, nên màn hình không bao giờ đứng im không giải thích được.
 * Không giữ tiến độ trong `useState` của component — mất kết nối là mất luôn tiến độ.
 */
export function useJob(
  jobId: string | null,
  /** Gọi một lần khi job về trạng thái cuối. Nhận cả `job` để nơi gọi đọc `message` / `error_code`. */
  onSettled?: (job: ApiJob) => void,
): JobView {
  const queryClient = useQueryClient();
  const [connectionLost, setConnectionLost] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const { data } = useQuery({
    queryKey: qk.job(jobId ?? 'none'),
    queryFn: () => api.get<{ job: ApiJob }>(`/jobs/${jobId}`),
    enabled: Boolean(jobId),
    // Poll đều đặn: đây là đường thứ hai không phụ thuộc SSE (§5.5 luật 4).
    refetchInterval: (q) => {
      const s = q.state.data?.job.status;
      return s === 'DONE' || s === 'FAILED' ? false : 2500;
    },
  });

  const job = data?.job ?? null;
  const isRunning = job?.status === 'QUEUED' || job?.status === 'RUNNING';

  /**
   * Đồng hồ "đã trôi bao lâu" (§5.5 luật 3). Mốc thời gian lấy **bên trong** effect và chỉ cập
   * nhật state từ callback của `setInterval` — không gọi `setState` đồng bộ trong thân effect,
   * cũng không đọc ref lúc render.
   */
  useEffect(() => {
    if (!jobId || !isRunning) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [jobId, isRunning]);

  useEffect(() => {
    if (!jobId) return;
    // `withCredentials` là bắt buộc khi gọi thẳng sang api.<domain>: không có nó thì
    // EventSource **không gửi cookie** và server trả 401 — luồng tiến độ chết im lặng.
    const es = new EventSource(apiUrl(`/jobs/${jobId}/stream`), {
      withCredentials: true,
    });

    const bump = () => {
      setConnectionLost(false);
      void queryClient.invalidateQueries({ queryKey: qk.job(jobId) });
    };
    for (const type of [
      'job.progress',
      'judge.started',
      'judge.done',
      'judge.summary',
      'job.done',
      'job.failed',
    ]) {
      es.addEventListener(type, bump);
    }
    es.onmessage = bump;
    es.onerror = () => setConnectionLost(true);

    return () => es.close();
  }, [jobId, queryClient]);

  /**
   * Bắn **đúng một lần** cho mỗi job, ở trạng thái cuối — `DONE` hoặc `FAILED`.
   *
   * Không dựa vào deps để chống lặp: `onSettled` là callback của nơi gọi, đổi identity là
   * effect chạy lại và người dùng ăn hai toast cho cùng một job. `notifiedRef` chốt theo
   * `jobId` nên dù re-render kiểu gì cũng chỉ báo một lần.
   */
  const notifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!jobId || !job) return;
    if (job.status !== 'DONE' && job.status !== 'FAILED') return;
    if (notifiedRef.current === jobId) return;
    notifiedRef.current = jobId;
    onSettled?.(job);
  }, [jobId, job, onSettled]);

  return { job, elapsedMs: isRunning ? elapsedMs : 0, connectionLost, isRunning };
}
