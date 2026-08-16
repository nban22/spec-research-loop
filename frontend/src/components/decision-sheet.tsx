'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

/**
 * **[mobile]** Bottom sheet giữ toàn bộ cột quyết định (DESIGN_SYSTEM §6.3).
 *
 * Luật khác thường, có lý do nghiệp vụ: sheet **không bao giờ đóng hẳn** — kéo xuống hết chỉ về
 * nấc "hé". Hệ thống này *không có bước nào tự chốt*, nên luôn tồn tại một việc chờ người dùng,
 * và chỗ chứa việc đó không được biến mất. Đóng rồi thì không còn dấu hiệu nào cho biết đang có
 * việc chờ quyết.
 *
 * Khi bước hiện tại hết việc để quyết, nấc hé đổi sang trạng thái xong (nền xanh lá) và nút
 * chính thành "Sang bước tiếp theo".
 *
 * Vùng ngón cái phải thuộc về hành động chính — đây là lý do **không** làm bottom tab bar (§6.6).
 */
export function DecisionSheet({
  summary,
  count,
  children,
}: {
  summary?: string;
  count: number;
  children: ReactNode;
}) {
  const hasWork = count > 0;

  return (
    <div className="border-hairline bg-surface shadow-sheet pb-safe fixed inset-x-0 bottom-0 z-30 border-t md:hidden">
      <Drawer>
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2.5',
            hasWork ? 'bg-decide-soft' : 'bg-ok-soft',
          )}
        >
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              hasWork ? 'text-decide-strong' : 'text-ok-strong',
            )}
          >
            {hasWork ? (
              <TriangleAlert className="size-4" aria-hidden />
            ) : (
              <CircleCheck className="size-4" aria-hidden />
            )}
            <span className="line-clamp-1">
              {hasWork
                ? (summary ?? `Cần bạn quyết: ${count}`)
                : 'Đã đủ điều kiện sang bước sau'}
            </span>
          </span>
          <DrawerTrigger asChild>
            <Button size="sm" className="ml-auto shrink-0">
              Xem &amp; chọn
            </Button>
          </DrawerTrigger>
        </div>

        <DrawerContent className="max-h-[88svh]">
          <DrawerTitle className="px-4 pt-1 pb-2 text-sm font-semibold">
            Việc cần bạn quyết
          </DrawerTitle>
          <div className="space-y-3 overflow-y-auto px-3 pb-6">{children}</div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
