import { create } from 'zustand';
import type { CardStatus } from '@/lib/types';

/**
 * Zustand holds **only** UI state (STACK §5). Never copy server data in here — a copy means two
 * versions, and the one in the store goes stale exactly when the user has just created a new
 * spec version.
 *
 * The current step is **not** here: it lives in the URL (`/projects/:id/step/N`) so a refresh
 * lands in the right place and links are shareable (SYSTEM_DESIGN_ANALYSIS S7 · F.4).
 *
 * Admission rule: **only** UI state the user would notice "losing" when a component unmounts.
 * State that lives inside one screen and dies with it belongs in `useState` — putting it here
 * creates a field nobody reads. Four fields once declared here (`sheetStage`, `navOpen`,
 * `stepPickerOpen`, `activeIssueGroupId`) were removed for exactly that reason: the shadcn
 * `<Sheet>` manages its own open state (`top-nav.tsx`), and the issue being worked on lives in
 * a `useState` inside `step-4.tsx` and is passed down to `judge.tsx` via the `activeId` prop.
 */
type UiState = {
  /**
   * The card-board filter in `CardBoard` (`components/spec-cards.tsx`).
   *
   * In the store rather than in `useState` because `CardBoard` unmounts on every stepper change —
   * kept locally, a user who filters by "Missing", visits step 2 and comes back loses the filter.
   */
  cardFilter: CardStatus | 'ALL';
  setCardFilter: (v: CardStatus | 'ALL') => void;
};

export const useUiStore = create<UiState>((set) => ({
  cardFilter: 'ALL',
  setCardFilter: (cardFilter) => set({ cardFilter }),
}));
