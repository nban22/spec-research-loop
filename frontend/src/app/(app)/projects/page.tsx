'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProjectCard, type ProjectSummary } from '@/components/project-card';
import { CardSkeleton, EmptyState } from '@/components/states';
import { api, qk } from '@/lib/api';

/** Lưới card: 1 cột mobile · 2 tablet · 3 desktop (DESIGN_SYSTEM §5.4). */
export default function ProjectsPage() {
  const { data, isLoading } = useQuery({
    queryKey: qk.projects,
    queryFn: () => api.get<{ projects: ProjectSummary[] }>('/projects'),
  });

  const projects = data?.projects ?? [];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-ink-1 text-xl font-semibold">Dự án của tôi</h1>
        <Button asChild size="sm">
          <Link href="/">Dự án mới</Link>
        </Button>
      </div>

      {isLoading ? (
        <CardSkeleton rows={3} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="Chưa có dự án nào"
          description="Nhập một ý tưởng nghiên cứu ở trang chủ để bắt đầu. Ý tưởng càng mơ hồ thì hệ thống càng có việc để làm."
          action={
            <Button asChild size="sm" className="mt-1">
              <Link href="/">Nhập ý tưởng đầu tiên</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
