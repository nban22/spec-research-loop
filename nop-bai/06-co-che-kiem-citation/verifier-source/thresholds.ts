/**
 * Ngưỡng khởi điểm của citation verifier (ARCHITECTURE §6.5).
 * **Đây là ước đoán, không phải số đo** — hiệu chỉnh bằng grid 3×3 trên 20 cặp human-label
 * ở cuối phase 2 (`eval/calibrate.ts`).
 *
 * Bộ ngưỡng được **chép vào `VerifierRun.config` mỗi lần chạy**, để nhãn cũ vẫn giải thích được
 * sau khi ngưỡng đổi (NFR-VER-4).
 */
export type VerifierThresholds = {
  tau_low: number;
  tau_high: number;
  conf_min: number;
  title_match: number;
  min_abstract_chars: number;
  stale_years: number;
};

export const DEFAULT_THRESHOLDS: VerifierThresholds = {
  tau_low: 0.35,
  tau_high: 0.72,
  conf_min: 0.7,
  title_match: 0.85,
  min_abstract_chars: 200,
  stale_years: 8,
};

export const GRID = {
  tau_low: [0.3, 0.35, 0.4],
  tau_high: [0.68, 0.72, 0.76],
} as const;
