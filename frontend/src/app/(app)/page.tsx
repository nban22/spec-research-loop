'use client';

import { useQuery } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { IdeaInput } from '@/components/idea-input';
import { Panel } from '@/components/panel';
import { ProjectCard, type ProjectSummary } from '@/components/project-card';
import { ResearchFlowAnimation } from '@/components/research-flow';
import { api, qk } from '@/lib/api';

/** Home page: a large `IdeaInput` to open a new project + a few recent projects (DESIGN_SYSTEM §5.4). */
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
          Start from an idea that is still vague
        </h1>
        <p className="text-ink-3 text-sm">
          The system paraphrases it back, searches for real literature, and puts it through 5
          independent judges — you make the call at every step.
        </p>
      </header>

      <Panel accent="brand" icon={Lightbulb} title="Your research idea">
        <IdeaInput variant="create" />
      </Panel>

      {/* Placed RIGHT UNDER the input, not at the bottom of the page: a first-time user needs to
          know what happens after they press the button, before deciding whether to type at all. */}
      <ResearchFlowAnimation />

      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-ink-1 text-sm font-semibold">Recent projects</h2>
            <Link href="/projects" className="text-brand-strong text-xs underline">
              View all
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
