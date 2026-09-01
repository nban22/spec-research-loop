'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ProjectCard, type ProjectSummary } from '@/components/project-card';
import { CardSkeleton, EmptyState } from '@/components/states';
import { api, qk } from '@/lib/api';

/**
 * The nav's "Version history" entry is global, but versions belong to **one** project.
 * This page is the project picker; the real history lives at `/projects/:id/versions`.
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
        <h1 className="text-ink-1 text-xl font-semibold">Version history</h1>
        <p className="text-ink-3 text-sm">Pick a project to see its versions and compare them.</p>
      </div>

      {isLoading ? (
        <CardSkeleton rows={2} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Version history appears once you create a project and apply your first decision."
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
        View version history →
      </Link>
    </div>
  );
}
