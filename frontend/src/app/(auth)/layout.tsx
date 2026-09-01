'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { api, qk } from '@/lib/api';

/**
 * The **outbound** direction of route protection (#25) — the mirror of `(app)/layout.tsx`.
 *
 * Before this layout, route guarding only worked one way: `(app)/layout.tsx` kicks a **signed-out**
 * visitor to `/login`, but nothing kicked a **signed-in** one off `/login`. Returning via a
 * bookmark or browser history showed the sign-in form despite a valid session; worse, `/register`
 * let a second account be created from inside a live session.
 *
 * ## Why we ask `/auth/me` instead of reading the cookie in middleware
 *
 * The session cookie is `httpOnly`, so the client cannot read it, and middleware only sees whether
 * the cookie is **present**, not whether it is still valid. Redirecting on "a cookie exists" creates
 * a loop once the token expires:
 *
 *   `/login` → middleware sees a cookie → pushes to `/` → `(app)` calls `/auth/me`, gets 401
 *   → pushes back to `/login` → forever.
 *
 * Asking `/auth/me` **verifies** instead of guessing, so it can never fall into that loop — the
 * "no redirect loops" criterion of #25.
 *
 * The cost: a **signed-out** visitor pays one 401 request before seeing the form. Acceptable,
 * because `qk.me` shares its key with `(app)/layout.tsx` — arriving from inside the app the cache
 * is already warm and no round trip is added.
 *
 * ⚠️ Precisely because it shares the `qk.me` key, this layout **depends** on `top-nav.tsx` calling
 * `queryClient.clear()` **before** redirecting to `/login` on sign-out. Drop that clear and the
 * cache still holds the old session, this layout sees `data` and bounces back to `/` — signed out
 * and instantly dragged back into the app. Revisit this if you change `logout`.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<{ user: { id: string } }>('/auth/me'),
    retry: false,
  });

  useEffect(() => {
    // `/` is where `auth-form.tsx` sends the user after a successful sign-in —
    // keeping exactly one destination for every way into the app.
    if (data) router.replace('/');
  }, [data, router]);

  // Still asking, **or** we know a session exists and the redirect is pending ⇒ do not render the
  // form. Flashing it for one frame before jumping is worse than the bug itself.
  if (isLoading || data) {
    return (
      <main className="bg-canvas flex min-h-svh items-center justify-center px-4 py-10">
        <div className="bg-surface shadow-card border-hairline w-full max-w-sm space-y-5 rounded-xl border p-6">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
