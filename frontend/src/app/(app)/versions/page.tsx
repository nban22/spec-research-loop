'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ProjectCard, type ProjectSummary } from '@/components/project-card';
import { CardSkeleton, EmptyState } from '@/components/states';
import { api, qk } from '@/lib/api';

/**
 * Mục "Lịch sử phiên bản" của nav là toàn cục, nhưng version thì thuộc về **một** dự án.
 * Trang này là bước chọn dự án; lịch sử thật nằm ở `/projects/:id/versions`.
 */
export default function VersionsIndexPage() {
  const { data, isLoading } = useQuery({
    queryKey: qk.projects,
    queryFn: () => api.get<{ projects: ProjectSummary[] }>('/projects'),
  });
  const projects = data?.projects ?? [];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <div>
        <h1 className="text-ink-1 text-xl font-semibold">Lịch sử phiên bản</h1>
        <p className="text-ink-3 text-sm">Chọn dự án để xem các phiên bản và so sánh chúng.</p>
      </div>

      {isLoading ? (
        <CardSkeleton rows={2} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="Chưa có dự án nào"
          description="Lịch sử phiên bản xuất hiện sau khi bạn tạo dự án và áp dụng quyết định đầu tiên."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="contents">
              <ProjectCardWithVersionLink project={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCardWithVersionLink({ project }: { project: ProjectSummary }) {
  return (
    <div>
      <ul className="contents">
        <ProjectCard project={project} />
      </ul>
      <Link
        href={`/projects/${project.id}/versions`}
        className="text-brand-strong mt-3 block px-3 text-xs underline underline-offset-2"
      >
        Xem lịch sử phiên bản →
      </Link>
    </div>
  );
}
