'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api, qk } from '@/lib/api';

/**
 * The three write commands of the claim-evidence map (#15), mirroring the backend `card-link/`
 * module.
 *
 * All three **invalidate the same branch**: `['spec-versions', versionId, 'cards']`. A card and
 * its links ship in one payload (`ApiCard.card_sources`), so invalidating them separately would
 * only produce two fetches for the same thing.
 *
 * **No** optimistic updates at this layer. Drag and drop needs instant feedback, but that
 * feedback belongs to the component — it knows which card is being dragged, the hook does not.
 * Putting optimism here would mean re-implementing the shape of the whole `cards` tree in the
 * cache, and that copy would drift the first time somebody adds a field to `ApiCard`.
 */

function invalidateCards(
  queryClient: ReturnType<typeof useQueryClient>,
  versionId: string | undefined,
) {
  if (versionId) void queryClient.invalidateQueries({ queryKey: qk.cards(versionId) });
}

/** Default error toast — even when `code` is unreadable, the user must never be left guessing. */
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
    onError: (err) => fail(err, 'The source could not be linked to the card. Please try again.'),
  });
}

export function useUnlinkSource(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardSourceId: string) =>
      api.del<{ id: string; deleted: boolean }>(`/card-sources/${cardSourceId}`),
    onSuccess: () => invalidateCards(queryClient, versionId),
    onError: (err) => fail(err, 'The link could not be removed. Please try again.'),
  });
}

export function useDeleteCard(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => api.del<{ id: string; deleted: boolean }>(`/cards/${cardId}`),
    onSuccess: () => {
      invalidateCards(queryClient, versionId);
      toast.success('Card deleted.');
    },
    onError: (err) => fail(err, 'The card could not be deleted. Please try again.'),
  });
}
