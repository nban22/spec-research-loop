'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { CommandPalette } from '@/components/command-palette';
import { TopNav } from '@/components/top-nav';
import { api, qk } from '@/lib/api';

/**
 * Every page in this group sits **behind the login** and depends on user-specific data
 * ⇒ client rendered, with no SEO requirement (SYSTEM_DESIGN_ANALYSIS S7 · F.8).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<{ user: { id: string } }>('/auth/me'),
    retry: false,
  });

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (isLoading || !data) {
    return (
      <div className="mx-auto w-full max-w-350 space-y-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      <TopNav />
      <main className="flex-1">{children}</main>
      {/* The shortcut listener lives at layout level: ⌘K must work from any screen after login. */}
      <CommandPalette />
    </>
  );
}
