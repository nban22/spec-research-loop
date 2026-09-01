'use client';

import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { HintBox } from '@/components/hint-box';
import { OptionList } from '@/components/option-list';
import { Panel } from '@/components/panel';
import {
  CONFLICT_SCOPE_LABEL,
  CONFLICT_SIGNAL_LABEL,
} from '@/lib/status-style';
import {
  useConflicts,
  useGateDecision,
  useGateOptions,
  type ApiConflict,
} from '@/lib/use-project';

/**
 * Giao diện **đối chất hai cột** cho xung đột nguồn (#3).
 *
 * Dùng lại nguyên bốn đường ra `GATE_OPTIONS` và cặp hook `useGateOptions`/`useGateDecision` mà
 * bước 5 đang dùng cho trích dẫn không có nguồn hỗ trợ — nên lựa chọn của người dùng tự thành một
 * dòng `Decision`, không phải dựng thêm một đường quyết định thứ hai.
 *
 * Xử **từng xung đột một** và tự đẩy cái đã xử ra khỏi hàng đợi: cùng lý do đã ghi ở `step-5.tsx`,
 * phương án "tôi sẽ đi tìm nguồn khác" không đổi dữ liệu gì nên nếu không bỏ ra thì panel ghim
 * vĩnh viễn ở xung đột đầu tiên.
 */
export function ConflictPanel({
  projectId,
  versionId,
}: {
  projectId: string;
  versionId: string | undefined;
}) {
  const { data } = useConflicts(versionId);
  const [handled, setHandled] = useState<string[]>([]);

  const conflicts = (data?.conflicts ?? []).filter((c) => !handled.includes(c.id));
  const current = conflicts[0] ?? null;

  const gateDecision = useGateDecision(projectId);
  /* Xung đột nào cũng có hai phía; đưa phía **A** vào cổng quyết định vì đó là cặp
     claim–nguồn mà người dùng sẽ sửa nếu chọn "sửa khẳng định cho khớp nguồn". */
  const { data: options } = useGateOptions(current?.card_source_a_id);

  if (!data) return null;
  if ((data.conflicts ?? []).length === 0) return null;

  if (!current) {
    return (
      <HintBox tone="ok" title="Đã xử xong các mâu thuẫn">
        <p>
          Bạn đã chọn cách xử lý cho tất cả {data.conflicts.length} mâu thuẫn ở phiên bản này.
        </p>
      </HintBox>
    );
  }

  return (
    <Panel
      accent="decide"
      icon={CircleAlert}
      title={`Mâu thuẫn giữa các nguồn (${conflicts.length})`}
    >
      <ConflictFace conflict={current} />

      <OptionList
        /* Remount theo xung đột đang xử — `OptionList` giữ lựa chọn và ô lý do trong state cục
           bộ, không remount thì lý do của xung đột trước bị gán cho xung đột sau. */
        key={current.id}
        question={
          options?.question ??
          'Hai nguồn này nói ngược nhau. Bạn muốn xử lý thế nào?'
        }
        options={options?.options ?? []}
        variant="stacked"
        disabled={!options}
        submitting={gateDecision.isPending}
        submitLabel="Xác nhận cách xử lý"
        onSubmit={(chosenKey, customText) =>
          gateDecision.mutate(
            {
              cardSourceId: current.card_source_a_id,
              chosenKey,
              customText,
            },
            {
              onSuccess: () => {
                setHandled((h) => [...h, current.id]);
                toast.success(
                  'Hệ thống đã ghi nhận lựa chọn của bạn cho mâu thuẫn này.',
                );
              },
            },
          )
        }
      />
    </Panel>
  );
}

/** Hai cột đối chất — nguồn nói A bên trái, nguồn nói B bên phải, **kèm câu trích nguyên văn**. */
function ConflictFace({ conflict }: { conflict: ApiConflict }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-ink-1 text-sm font-medium">{conflict.card_title}</p>
        <p className="text-ink-3 text-xs">
          {CONFLICT_SCOPE_LABEL[conflict.scope] ?? conflict.scope} ·{' '}
          {CONFLICT_SIGNAL_LABEL[conflict.signal] ?? conflict.signal}
          {conflict.other_card_title
            ? ` · thẻ đối diện: “${conflict.other_card_title}”`
            : ''}
        </p>
      </div>

      {/* Một cột dưới md, hai cột từ md — bố cục cấp trang chỉ dùng md: và xl: (DS §7.3). */}
      <div className="grid gap-2 md:grid-cols-2">
        <Side
          title={conflict.source_a_title}
          quote={conflict.evidence_a}
          label="Nguồn thứ nhất nói"
        />
        <Side
          title={conflict.source_b_title}
          quote={conflict.evidence_b}
          label="Nguồn thứ hai nói"
        />
      </div>

      <HintBox tone="warn" title="Vì sao hệ thống báo mâu thuẫn">
        <p>{conflict.reason}</p>
        {conflict.terms.length > 0 && (
          <p className="mt-1">Dấu hiệu: {conflict.terms.join(' · ')}</p>
        )}
      </HintBox>
    </div>
  );
}

function Side({
  title,
  quote,
  label,
}: {
  title: string;
  quote: string;
  label: string;
}) {
  return (
    <div className="border-hairline bg-sunken rounded-md border p-3">
      <p className="text-ink-4 text-2xs tracking-wide uppercase">{label}</p>
      <p className="text-ink-2 mt-1 text-xs font-medium">{title}</p>
      {/* Trích **nguyên văn** để người đọc tự đối chiếu, không phải tin máy. */}
      <p className="text-ink-1 mt-2 text-sm leading-relaxed italic">
        {quote ? `“${quote}”` : 'Nguồn này không có câu trích để đối chiếu.'}
      </p>
    </div>
  );
}
