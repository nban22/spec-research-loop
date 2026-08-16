import Link from 'next/link';
import { STEPS } from '@/lib/types';

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
  DRAFT: 'Nháp',
  IN_PROGRESS: 'Đang làm',
  FINAL: 'Đã chốt',
};

/**
 * Mỗi dự án một card: tên (lấy từ ý tưởng thô, cắt bớt), bước đang đứng, số version,
 * thời điểm sửa cuối, nút mở (DESIGN_SYSTEM §5.3). Mockup không vẽ màn này nhưng nav có
 * mục "Dự án" và ARCHITECTURE §3 đã cấp route.
 */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  const stepNo = STEPS.find((s) => s.step === project.step)?.no ?? 1;
  return (
    <li className="border-hairline bg-surface shadow-card rounded-lg border p-3">
      <Link href={`/projects/${project.id}/step/${stepNo}`} className="block space-y-1.5">
        <h3 className="text-ink-1 line-clamp-2 text-sm font-medium">{project.title}</h3>
        <p className="text-ink-3 line-clamp-2 text-xs">{project.raw_idea}</p>
        <div className="text-ink-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-brand-strong font-medium">Bước {stepNo}/5</span>
          <span>{STATUS_LABEL[project.status]}</span>
          <span>{project.version_count} phiên bản</span>
          <span>{project.decision_count} quyết định</span>
        </div>
        <p className="text-ink-4 text-xs">
          Sửa lần cuối {new Date(project.updated_at).toLocaleString('vi-VN')}
        </p>
      </Link>
    </li>
  );
}
