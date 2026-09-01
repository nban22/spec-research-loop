'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api, qk } from '@/lib/api';

/**
 * Ba lệnh ghi của bản đồ claim–evidence (#15), khớp với module `card-link/` ở backend.
 *
 * Cả ba **invalidate cùng một nhánh**: `['spec-versions', versionId, 'cards']`. Thẻ và liên kết
 * của nó cùng nằm trong một payload (`ApiCard.card_sources`), nên tách ra invalidate riêng chỉ
 * tạo ra hai lần fetch cho cùng một thứ.
 *
 * **Không** làm optimistic update ở tầng này. Kéo thả cần phản hồi tức thì, nhưng phản hồi đó
 * thuộc về component — nó biết thẻ đang được kéo là thẻ nào, còn hook thì không. Nhét optimistic
 * vào đây nghĩa là phải chép lại hình dạng của cả cây `cards` trong cache, và bản chép đó sẽ lệch
 * đi lần đầu ai thêm một trường vào `ApiCard`.
 */

function invalidateCards(
  queryClient: ReturnType<typeof useQueryClient>,
  versionId: string | undefined,
) {
  if (versionId) void queryClient.invalidateQueries({ queryKey: qk.cards(versionId) });
}

/** Thông báo lỗi mặc định — `code` không đọc được thì cũng không được để người dùng đoán. */
function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback);
}

export function useLinkSource(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cardId: string; sourceId: string }) =>
      api.post<{ card_source: { id: string } }>(`/cards/${input.cardId}/sources`, {
        source_id: input.sourceId,
      }),
    onSuccess: () => invalidateCards(queryClient, versionId),
    onError: (err) => fail(err, 'Hệ thống chưa nối được nguồn vào thẻ. Bạn vui lòng thử lại.'),
  });
}

export function useUnlinkSource(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardSourceId: string) =>
      api.del<{ id: string; deleted: boolean }>(`/card-sources/${cardSourceId}`),
    onSuccess: () => invalidateCards(queryClient, versionId),
    onError: (err) => fail(err, 'Hệ thống chưa gỡ được liên kết. Bạn vui lòng thử lại.'),
  });
}

export function useDeleteCard(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => api.del<{ id: string; deleted: boolean }>(`/cards/${cardId}`),
    onSuccess: () => {
      invalidateCards(queryClient, versionId);
      toast.success('Đã xoá thẻ.');
    },
    onError: (err) => fail(err, 'Hệ thống chưa xoá được thẻ. Bạn vui lòng thử lại.'),
  });
}
