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
 * Track a background job.
 *
 * **SSE is an accelerator, not the source of truth** (SYSTEM_DESIGN_ANALYSIS S5 · F.8): the state
 * lives in the TanStack Query for `GET /jobs/:id`; `EventSource` only *pushes* updates into it.
 * If the connection drops, polling keeps running, so the screen never freezes inexplicably. Never
 * hold progress in a component `useState` — losing the connection would lose the progress too.
 */
export function useJob(
  jobId: string | null,
  /** Called once when the job reaches a terminal state. Receives `job` so the caller can read `message` / `error_code`. */
  onSettled?: (job: ApiJob) => void,
): JobView {
  const queryClient = useQueryClient();
  const [connectionLost, setConnectionLost] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const { data } = useQuery({
    queryKey: qk.job(jobId ?? 'none'),
    queryFn: () => api.get<{ job: ApiJob }>(`/jobs/${jobId}`),
    enabled: Boolean(jobId),
    // Steady polling: the second path, independent of SSE (§5.5 rule 4).
    refetchInterval: (q) => {
      const s = q.state.data?.job.status;
      return s === 'DONE' || s === 'FAILED' ? false : 2500;
    },
  });

  const job = data?.job ?? null;
  const isRunning = job?.status === 'QUEUED' || job?.status === 'RUNNING';

  /**
   * The "how long has this been running" clock (§5.5 rule 3). The start timestamp is taken
   * **inside** the effect and state is only updated from the `setInterval` callback — no
   * synchronous `setState` in the effect body, and no ref reads during render.
   */
  useEffect(() => {
    if (!jobId || !isRunning) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [jobId, isRunning]);

  useEffect(() => {
    if (!jobId) return;
    // `withCredentials` is mandatory when calling api.<domain> directly: without it
    // EventSource **sends no cookie** and the server answers 401 — the progress stream dies silently.
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
   * Fires **exactly once** per job, at a terminal state — `DONE` or `FAILED`.
   *
   * Deduplication does not rely on deps: `onSettled` is the caller's callback, and a change of
   * identity would re-run the effect and hit the user with two toasts for one job. `notifiedRef`
   * latches on `jobId`, so no re-render pattern can notify twice.
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
