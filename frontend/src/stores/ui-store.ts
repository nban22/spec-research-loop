import { create } from 'zustand';
import type { CardStatus } from '@/lib/types';

/**
 * Zustand **chỉ** giữ UI state (STACK §5). Không bao giờ chép dữ liệu server vào đây —
 * chép là có hai bản, và bản trong store sẽ cũ đúng lúc người dùng vừa tạo version mới.
 *
 * Bước đang đứng **không** nằm ở đây: nó ở URL (`/projects/:id/step/N`), để F5 về đúng chỗ
 * và link gửi được (SYSTEM_DESIGN_ANALYSIS S7 · F.4).
 *
 * Luật vào store: **chỉ** state UI mà người dùng thấy được là "mất" khi component unmount.
 * State chỉ sống trong một màn hình và chết cùng nó thì để `useState` — đưa vào đây là tạo
 * một field không ai đọc. Bốn field từng khai ở đây (`sheetStage`, `navOpen`, `stepPickerOpen`,
 * `activeIssueGroupId`) đã bị gỡ vì đúng lý do đó: `<Sheet>` của shadcn tự quản trạng thái mở
 * (`top-nav.tsx`), còn issue đang xử lý sống ở `useState` của `step-4.tsx` rồi truyền xuống
 * `judge.tsx` qua prop `activeId`.
 */
type UiState = {
  /**
   * Bộ lọc bảng thẻ ở `CardBoard` (`components/spec-cards.tsx`).
   *
   * Ở store chứ không ở `useState` vì `CardBoard` unmount mỗi lần đổi bước trên stepper —
   * để local thì người dùng lọc "Còn thiếu", đi xem bước 2, quay lại là mất bộ lọc.
   */
  cardFilter: CardStatus | 'ALL';
  setCardFilter: (v: CardStatus | 'ALL') => void;
};

export const useUiStore = create<UiState>((set) => ({
  cardFilter: 'ALL',
  setCardFilter: (cardFilter) => set({ cardFilter }),
}));
