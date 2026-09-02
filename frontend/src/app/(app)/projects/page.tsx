'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProjectCard, type ProjectSummary } from '@/components/project-card';
import { CardSkeleton, EmptyState } from '@/components/states';
import { Lightbulb } from 'lucide-react';
import { api, qk } from '@/lib/api';

/** Card grid: 1 column on mobile · 2 on tablet · 3 on desktop (DESIGN_SYSTEM §5.4). */
export default function ProjectsPage() {
  const { data, isLoading } = useQuery({
    queryKey: qk.projects,
    queryFn: () => api.get<{ projects: ProjectSummary[] }>('/projects'),
  });

  const projects = data?.projects ?? [];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-ink-1 text-xl font-semibold">My projects</h1>
        <Button asChild size="sm">
          <Link href="/">New project</Link>
        </Button>
      </div>

      {isLoading ? (
        <CardSkeleton rows={3} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          tone="brand"
          title="No projects yet"
          description="Enter a research idea on the home page to begin. The vaguer the idea, the more the system has to work with."
          action={
            <Button asChild size="sm" className="mt-1">
              <Link href="/">Enter your first idea</Link>
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
