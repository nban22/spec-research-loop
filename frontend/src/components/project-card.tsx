import Link from 'next/link';
import { STEPS } from '@/lib/types';
import { cn } from '@/lib/utils';

export type ProjectSummary = {
  id: string;
  title: string;
  raw_idea: string;
  domain: string | null;
  step: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  status: 'DRAFT' | 'IN_PROGRESS' | 'FINAL';
  version_count: number;
  decision_count: number;
  updated_at: string;
};

const STATUS_LABEL: Record<ProjectSummary['status'], string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In progress',
  FINAL: 'Final',
};

/**
 * One card per project: title (taken from the raw idea, truncated), current step, version count,
 * last edit time, and an open action (DESIGN_SYSTEM §5.3). The mockups never draw this screen,
 * but the nav has a "Projects" entry and ARCHITECTURE §3 already assigns the route.
 */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  const stepNo = STEPS.find((s) => s.step === project.step)?.no ?? 1;
  return (
    <li
      className={cn(
        'group border-hairline bg-surface shadow-card relative rounded-lg border',
        'ease-out-quart transition-[border-color,box-shadow,transform] duration-150',
        'hover:border-brand-line hover:shadow-lift hover:-translate-y-px',
        // The focus ring sits on the `<li>`, not the `<a>`: a keyboard user must see the
        // **whole card** selected, exactly like what the mouse hovers (§6.10).
        'focus-within:border-brand-line focus-within:shadow-lift',
      )}
    >
      <Link
        href={`/projects/${project.id}/step/${stepNo}`}
        className="block space-y-1.5 rounded-lg p-3 outline-none"
      >
        <h3 className="text-ink-1 group-hover:text-brand-strong ease-out-quart line-clamp-2 text-sm font-medium transition-colors duration-150">
          {project.title}
        </h3>
        <p className="text-ink-3 line-clamp-2 text-xs">{project.raw_idea}</p>
        <div className="text-ink-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          <span className="text-brand-strong font-medium">Step {stepNo}/5</span>
          <span>{STATUS_LABEL[project.status]}</span>
          <span>{project.version_count} versions</span>
          <span>{project.decision_count} decisions</span>
        </div>
        <p className="text-ink-4 text-2xs tabular-nums">
          Last edited {new Date(project.updated_at).toLocaleString('en-US')}
        </p>
      </Link>
    </li>
  );
}
