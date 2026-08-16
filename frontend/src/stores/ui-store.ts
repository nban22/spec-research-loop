import { create } from 'zustand';
import type { CardStatus } from '@/lib/types';

/**
 * Zustand **chỉ** giữ UI state (STACK §5). Không bao giờ chép dữ liệu server vào đây —
 * chép là có hai bản, và bản trong store sẽ cũ đúng lúc người dùng vừa tạo version mới.
 *
 * Bước đang đứng **không** nằm ở đây: nó ở URL (`/projects/:id/step/N`), để F5 về đúng chỗ
 * và link gửi được (SYSTEM_DESIGN_ANALYSIS S7 · F.4).
 */
export type SheetStage = 'peek' | 'half' | 'full';

type UiState = {
  /** Nấc của `DecisionSheet` — ba nấc, không bao giờ đóng hẳn (§6.3). */
  sheetStage: SheetStage;
  setSheetStage: (s: SheetStage) => void;

  navOpen: boolean;
  setNavOpen: (v: boolean) => void;

  stepPickerOpen: boolean;
  setStepPickerOpen: (v: boolean) => void;

  /** Bộ lọc bảng thẻ ở `CardBoard`. */
  cardFilter: CardStatus | 'ALL';
  setCardFilter: (v: CardStatus | 'ALL') => void;

  /** Nhóm issue đang được xử lý ở B4. */
  activeIssueGroupId: string | null;
  setActiveIssueGroupId: (v: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sheetStage: 'peek',
  setSheetStage: (sheetStage) => set({ sheetStage }),

  navOpen: false,
  setNavOpen: (navOpen) => set({ navOpen }),

  stepPickerOpen: false,
  setStepPickerOpen: (stepPickerOpen) => set({ stepPickerOpen }),

  cardFilter: 'ALL',
  setCardFilter: (cardFilter) => set({ cardFilter }),

  activeIssueGroupId: null,
  setActiveIssueGroupId: (activeIssueGroupId) => set({ activeIssueGroupId }),
}));
