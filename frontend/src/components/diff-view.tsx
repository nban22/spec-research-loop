'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { Skeleton } from '@/components/ui/skeleton';
import { api, qk } from '@/lib/api';

type DiffPayload = {
  from: { id: string; version_no: number; label: string | null };
  to: { id: string; version_no: number; label: string | null };
  old_markdown: string;
  new_markdown: string;
};

/**
 * Bọc `react-diff-viewer-continued`, ép màu về họ `ok`/`danger` (DESIGN_SYSTEM §5.3).
 *
 * **Chuyển sang chế độ hợp nhất dưới mốc `md`** — diff hai cột ở 375px thì mỗi cột quá hẹp,
 * không đọc được (§6.5). Khối code trong diff là **một trong hai vùng duy nhất** được phép
 * cuộn ngang (§6.10).
 */
export function DiffView({ versionId, against }: { versionId: string; against?: string }) {
  const [splitView, setSplitView] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setSplitView(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.diff(versionId, against),
    queryFn: () =>
      api.get<DiffPayload>(
        `/spec-versions/${versionId}/diff${against ? `?against=${against}` : ''}`,
      ),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) {
    return <p className="text-ink-3 text-xs">Không dựng được so sánh cho hai phiên bản này.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-ink-2 text-xs font-medium">
        v{data.from.version_no} → v{data.to.version_no}
        {data.to.label ? ` · ${data.to.label}` : ''}
      </p>
      <div className="border-hairline overflow-x-auto rounded-lg border text-xs">
        <ReactDiffViewer
          oldValue={data.old_markdown}
          newValue={data.new_markdown}
          splitView={splitView}
          compareMethod={DiffMethod.WORDS}
          hideLineNumbers={!splitView}
          useDarkTheme={false}
          styles={{
            variables: {
              light: {
                diffViewerBackground: 'var(--color-surface)',
                addedBackground: 'var(--color-ok-soft)',
                addedColor: 'var(--color-ok-strong)',
                removedBackground: 'var(--color-danger-soft)',
                removedColor: 'var(--color-danger-strong)',
                wordAddedBackground: 'var(--color-ok-line)',
                wordRemovedBackground: 'var(--color-danger-line)',
                gutterBackground: 'var(--color-sunken)',
                codeFoldBackground: 'var(--color-sunken)',
                codeFoldGutterBackground: 'var(--color-sunken)',
                emptyLineBackground: 'var(--color-canvas)',
              },
            },
            contentText: { fontSize: '11px', lineHeight: '1.5' },
          }}
        />
      </div>
    </div>
  );
}
