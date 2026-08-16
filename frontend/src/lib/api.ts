import { messageOf } from './error-code';

/**
 * Client duy nhất đi ra API. Cấm `fetch()` trực tiếp trong component (frontend/CLAUDE.md §3).
 * Đường dẫn luôn tương đối `/api/...` — Next `rewrites()` chuyển sang backend, nên FE và BE
 * cùng origin và cookie httpOnly tự đi kèm.
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
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  })().finally(() => {
    // Nhả khoá ở nhịp sau để các request song song cùng đợi đúng một lần refresh.
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
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    // Access token hết hạn: làm mới **một** lần rồi thử lại đúng request đó.
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

/** Query key phân cấp — đổi dữ liệu xong thì invalidate đúng nhánh (frontend/CLAUDE.md §3). */
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
  diff: (id: string, against?: string) => ['spec-versions', id, 'diff', against] as const,
  job: (id: string) => ['jobs', id] as const,
};
