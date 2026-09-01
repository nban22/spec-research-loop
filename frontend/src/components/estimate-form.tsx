'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { QuantPicker, SliderRow, type SimInput } from '@/components/cost-simulator';
import { Button } from '@/components/ui/button';
import { ApiError, api, qk } from '@/lib/api';

/**
 * Form tự nhập tham số ước lượng tài nguyên.
 *
 * Chỉ hiện ở ca `INVALID_PARAMS`: kế hoạch **có** phần tính toán nhưng tham số mô hình trả về
 * không dùng được. Khác hẳn `NOT_APPLICABLE` — ở đó con số không tồn tại, còn ở đây nó tồn tại
 * và chỉ là chưa lấy được, nên mời người dùng nhập là việc đúng chứ không phải đẩy việc.
 *
 * `POST /projects/:id/estimate` **đã có sẵn từ lâu và chưa nơi nào gọi**. Không thêm endpoint.
 *
 * Dùng lại `SliderRow` và `QuantPicker` của màn mô phỏng chi phí: cùng bảy tham số, cùng thang
 * giá trị. Dựng một bộ input thứ hai chỉ để trông khác đi là mời hai chỗ trôi xa nhau.
 */
export function EstimateForm({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  /* Giá trị khởi tạo là **mặc định chung**, không phải tham số mô hình đã trả về — chúng vừa bị
     từ chối vì không hợp lệ, mồi lại chúng là mời người dùng gửi lại đúng cái vừa hỏng. */
  const [input, setInput] = useState<SimInput>({
    model_params_b: 7,
    quantization: 'int8',
    candidates: 8,
    rounds: 3,
    eval_samples: 200,
    avg_prompt_tokens: 1200,
    avg_output_tokens: 600,
  });

  const save = useMutation({
    mutationFn: () => api.post<{ estimate: unknown }>(`/projects/${projectId}/estimate`, input),
    onSuccess: () => {
      toast.success('Đã lưu ước lượng tài nguyên.');
      void queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
      setOpen(false);
      onSaved?.();
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Hệ thống chưa lưu được ước lượng. Bạn vui lòng thử lại.',
      );
    },
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Tự nhập tham số ước lượng
      </Button>
    );
  }

  return (
    <div className="border-hairline space-y-3 rounded-md border px-3 py-3">
      <SliderRow
        id="est-params"
        label="Cỡ model (tỉ tham số)"
        value={input.model_params_b}
        min={1}
        max={180}
        onChange={(v) => setInput((s) => ({ ...s, model_params_b: v }))}
      />
      <QuantPicker
        value={input.quantization}
        onChange={(v) => setInput((s) => ({ ...s, quantization: v }))}
      />
      <SliderRow
        id="est-candidates"
        label="Số ứng viên"
        value={input.candidates}
        min={1}
        max={64}
        onChange={(v) => setInput((s) => ({ ...s, candidates: v }))}
      />
      <SliderRow
        id="est-rounds"
        label="Số vòng"
        value={input.rounds}
        min={1}
        max={12}
        onChange={(v) => setInput((s) => ({ ...s, rounds: v }))}
      />
      <SliderRow
        id="est-eval"
        label="Số mẫu đánh giá"
        value={input.eval_samples}
        min={10}
        max={2000}
        step={10}
        onChange={(v) => setInput((s) => ({ ...s, eval_samples: v }))}
      />
      <SliderRow
        id="est-prompt-tokens"
        label="Token vào trung bình"
        value={input.avg_prompt_tokens}
        min={200}
        max={8000}
        step={100}
        onChange={(v) => setInput((s) => ({ ...s, avg_prompt_tokens: v }))}
      />
      <SliderRow
        id="est-output-tokens"
        label="Token ra trung bình"
        value={input.avg_output_tokens}
        min={100}
        max={4000}
        step={50}
        onChange={(v) => setInput((s) => ({ ...s, avg_output_tokens: v }))}
      />

      <div className="flex gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          Lưu ước lượng
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}
