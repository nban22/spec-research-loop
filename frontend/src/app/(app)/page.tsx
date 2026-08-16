'use client';

import { useQuery } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { IdeaInput } from '@/components/idea-input';
import { Panel } from '@/components/panel';
import { ProjectCard, type ProjectSummary } from '@/components/project-card';
import { api, qk } from '@/lib/api';

/** Trang chủ: `IdeaInput` cỡ lớn để mở dự án mới + vài dự án gần đây (DESIGN_SYSTEM §5.4). */
export default function HomePage() {
  const { data } = useQuery({
    queryKey: qk.projects,
    queryFn: () => api.get<{ projects: ProjectSummary[] }>('/projects'),
  });
  const recent = (data?.projects ?? []).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-5 md:px-4 md:py-8">
      <header className="space-y-1.5 text-center">
        <h1 className="text-ink-1 text-xl font-semibold md:text-2xl">
          Bắt đầu từ một ý tưởng còn mơ hồ
        </h1>
        <p className="text-ink-3 text-sm">
          Hệ thống sẽ diễn giải lại, đi tìm tài liệu thật, và cho 5 Judge phản biện — bạn là
          người quyết định ở từng bước.
        </p>
      </header>

      <Panel accent="brand" icon={Lightbulb} title="Ý tưởng nghiên cứu của bạn">
        <IdeaInput variant="create" />
      </Panel>

      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-ink-1 text-sm font-semibold">Dự án gần đây</h2>
            <Link href="/projects" className="text-brand-strong text-xs underline">
              Xem tất cả
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {recent.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
