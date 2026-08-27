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
    <li
      className={cn(
        'group border-hairline bg-surface shadow-card relative rounded-lg border',
        'ease-out-quart transition-[border-color,box-shadow,transform] duration-150',
        'hover:border-brand-line hover:shadow-lift hover:-translate-y-px',
        // Vòng focus đặt trên `<li>` chứ không trên `<a>`: người dùng bàn phím phải thấy
        // **cả card** được chọn, giống hệt thứ chuột đang rê lên (§6.10).
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
          <span className="text-brand-strong font-medium">Bước {stepNo}/5</span>
          <span>{STATUS_LABEL[project.status]}</span>
          <span>{project.version_count} phiên bản</span>
          <span>{project.decision_count} quyết định</span>
        </div>
        <p className="text-ink-4 text-2xs tabular-nums">
          Sửa lần cuối {new Date(project.updated_at).toLocaleString('vi-VN')}
        </p>
      </Link>
    </li>
  );
}
