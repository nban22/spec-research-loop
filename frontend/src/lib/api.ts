import { messageOf } from './error-code';

/**
 * The API origin — **environment adaptive**, decided at build time.
 *
 * - Left empty (the default, and the local setup): use relative `/api/*` paths so Next's
 *   `rewrites()` proxies to the backend ⇒ the browser sees the **same origin**, no CORS.
 * - Set `NEXT_PUBLIC_API_BASE=https://api.example.com`: call the backend directly. That drops
 *   one proxy hop for the ~90 second SSE stream, at the cost of needing CORS + a cookie with
 *   `Domain` on the backend side.
 *
 * `NEXT_PUBLIC_*` is **baked into the bundle at build time**, not read at runtime — so it must
 * be a `--build-arg` in the Dockerfile, not a container environment variable.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/+$/, '');

/** Build an absolute URL for the places that bypass `fetch` — `EventSource`, download links. */
export function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : `/api${path}`;
}

/**
 * The single client that reaches the API. Calling `fetch()` directly inside a component is
 * forbidden (frontend/CLAUDE.md §3). Paths stay relative `/api/...` — Next `rewrites()`
 * forwards them to the backend, so FE and BE share an origin and the httpOnly cookie rides along.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const res = await fetch(apiUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  })().finally(() => {
    // Release the lock on the next tick so parallel requests all await the same single refresh.
    setTimeout(() => {
      refreshing = null;
    }, 0);
  });
  return refreshing;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    // Access token expired: refresh **once**, then retry that exact request.
    if (await tryRefresh()) return request<T>(method, path, body, true);
  }

  const payload = await parse(res);
  if (!res.ok) {
    const shape = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      shape.code ?? 'INTERNAL_ERROR',
      messageOf(shape.code, shape.message),
      res.status,
      shape.details,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** Hierarchical query keys — after a mutation, invalidate the exact branch (frontend/CLAUDE.md §3). */
export const qk = {
  me: ['me'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  sources: (id: string) => ['projects', id, 'sources'] as const,
  decisions: (id: string) => ['projects', id, 'decisions'] as const,
  pending: (id: string) => ['projects', id, 'pending-decisions'] as const,
  versions: (id: string) => ['projects', id, 'versions'] as const,
  version: (id: string) => ['spec-versions', id] as const,
  cards: (id: string) => ['spec-versions', id, 'cards'] as const,
  issues: (id: string) => ['spec-versions', id, 'issues'] as const,
  judgeRuns: (id: string) => ['spec-versions', id, 'judge-runs'] as const,
  verification: (id: string) => ['spec-versions', id, 'verification'] as const,
  gate: (id: string) => ['spec-versions', id, 'gate'] as const,
  gateOptions: (cardSourceId: string) =>
    ['card-sources', cardSourceId, 'gate-options'] as const,
  diff: (id: string, against?: string) => ['spec-versions', id, 'diff', against] as const,
  job: (id: string) => ['jobs', id] as const,
  // Lane B · #7 — append at the end per shared rule 4; never edit someone else's line.
  overclaim: (id: string) => ['spec-versions', id, 'overclaim'] as const,
  // Lane C · #16 — append at the end per shared rule 4.
  sourceMap: (id: string) => ['projects', id, 'source-map'] as const,
  // Lane C · #18 — keyed by the query string because the preview is pure: one config, one result.
  estimatePreview: (id: string, query: string) =>
    ['projects', id, 'estimate-preview', query] as const,
  // Lane A · #1 — append at the end per shared rule 4.
  credibility: (id: string) => ['projects', id, 'credibility'] as const,
  // Lane A · #5 — the label explainability page.
  evidenceTrace: (id: string) =>
    ['spec-versions', id, 'evidence-trace'] as const,
  // Lane A · #3 — the source conflict queue.
  conflicts: (id: string) => ['spec-versions', id, 'conflicts'] as const,
  // Lane A · #4 — the blind labelling queue.
  labelQueue: (id: string) => ['spec-versions', id, 'label-queue'] as const,
  // Lane B · #9 — append at the end per shared rule 4.
  agreement: (id: string) =>
    ['spec-versions', id, 'judge-agreement'] as const,
};
