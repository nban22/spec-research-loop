import {
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  Info,
  OctagonAlert,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type {
  CardStatus,
  ConfidenceLevel,
  CredibilityTier,
  Severity,
  SupportLabel,
} from './types';

/**
 * **Nơi §3 của DESIGN_SYSTEM biến thành code.** Đây là file **duy nhất** trong `app/` và
 * `components/` được phép chứa class màu thô của Tailwind (§7.2), và ba component
 * `StatusChip` / `SeverityBadge` / `SupportTag` là nơi **duy nhất** được đọc nó (§7.1).
 *
 * Khai bằng `Record<Enum, …>` để thiếu một giá trị enum là **lỗi TypeScript lúc build**,
 * không phải badge trắng lúc chạy.
 *
 * Nguyên tắc: **hình dạng mã hoá NHÓM, màu mã hoá GIÁ TRỊ** (§3.1).
 *   CardStatus  → pill bo tròn hoàn toàn, nền rất nhạt, icon họ VÒNG TRÒN
 *   Severity    → khối đặc, góc vuông nhất, CHỮ HOA, icon họ ĐA GIÁC
 *   SupportLabel→ tag rỗng ruột, viền dày, CHỮ HOA, icon họ KHIÊN
 */

export type StatusStyle = { label: string; icon: LucideIcon; className: string };

export const CARD_STATUS_STYLE: Record<CardStatus, StatusStyle> = {
  CONFIRMED: {
    label: 'Đã xác nhận',
    icon: CircleCheck,
    className: 'bg-ok-soft text-ok-strong border-ok-line',
  },
  PROPOSED: {
    // Nền trắng, không tô — báo hiệu chưa được người dùng đóng dấu (§3.2).
    label: 'Đề xuất',
    icon: Circle,
    className: 'bg-surface text-brand-strong border-brand-line',
  },
  MISSING: {
    // Viền đứt nét là tín hiệu "chỗ trống", đọc được cả khi in trắng đen.
    label: 'Còn thiếu',
    icon: CircleDashed,
    className: 'bg-neutral-soft text-neutral-strong border-neutral-line border-dashed',
  },
  AMBIGUOUS: {
    label: 'Chưa rõ nghĩa',
    icon: CircleHelp,
    className: 'bg-warn-soft text-warn-strong border-warn-line',
  },
  UNSUPPORTED: {
    // Lỗi chặn export (verifier gate) — phải đỏ.
    label: 'Không có nguồn',
    icon: CircleSlash,
    className: 'bg-danger-soft text-danger-strong border-danger-line',
  },
  CONFLICT: {
    // Tím = cần người dùng phân xử; máy không tự chọn bên nào được.
    label: 'Mâu thuẫn',
    icon: CircleAlert,
    className: 'bg-decide-soft text-decide-strong border-decide-line',
  },
};

/** Vạch màu dọc cạnh trái `SpecCard` — thẻ **không** tô nền theo trạng thái (§3.7). */
export const CARD_STATUS_BAR: Record<CardStatus, string> = {
  CONFIRMED: 'bg-ok-ink',
  PROPOSED: 'bg-brand-ink',
  MISSING: 'bg-neutral-line',
  AMBIGUOUS: 'bg-warn-ink',
  UNSUPPORTED: 'bg-danger-ink',
  CONFLICT: 'bg-decide-ink',
};

export const SEVERITY_STYLE: Record<Severity, StatusStyle> = {
  CRITICAL: {
    label: 'CRITICAL',
    icon: OctagonAlert,
    className: 'bg-danger-ink text-white',
  },
  MAJOR: {
    label: 'MAJOR',
    icon: TriangleAlert,
    className: 'bg-major-ink text-white',
  },
  MINOR: {
    // [QĐ] lệch mockup 4: chữ trắng trên nền vàng không đọc nổi → đổi sang chữ màu mực (§3.3).
    label: 'MINOR',
    icon: Info,
    className: 'bg-minor-ink text-minor-strong',
  },
};

export const SUPPORT_STYLE: Record<SupportLabel, StatusStyle> = {
  SUPPORTED: {
    label: 'SUPPORTED',
    icon: ShieldCheck,
    className: 'border-ok-ink text-ok-strong',
  },
  WEAK: {
    label: 'WEAK',
    icon: ShieldAlert,
    className: 'border-warn-ink text-warn-strong',
  },
  UNSUPPORTED: {
    label: 'UNSUPPORTED',
    icon: ShieldX,
    className: 'border-danger-ink text-danger-strong',
  },
};

/**
 * Nhóm enum thứ tư. Cố ý **không** có component badge riêng: ba vật thể ở §3.1 đã dùng hết ba
 * hình dạng phân biệt được khi in trắng đen. Render thành một dòng trong `HintBox` (§3.8).
 * `LOW` dùng `warn` chứ **không** dùng `danger` — hệ thống hiểu chưa chắc không phải là *lỗi*.
 */
export const CONFIDENCE_STYLE: Record<
  ConfidenceLevel,
  { label: string; tone: 'ok' | 'warn'; hint: string }
> = {
  HIGH: {
    label: 'Cao',
    tone: 'ok',
    hint: 'Hệ thống hiểu chắc ý tưởng của bạn.',
  },
  MEDIUM: {
    label: 'Trung bình',
    tone: 'warn',
    hint: 'Nên đọc lại phần diễn giải bên trên xem có đúng ý bạn không.',
  },
  LOW: {
    label: 'Thấp',
    tone: 'warn',
    hint: 'Hệ thống chưa chắc đã hiểu đúng — cân nhắc sửa lại ý tưởng cho cụ thể hơn rồi phân tích lại.',
  },
};

/** Cờ chẩn đoán của verifier → câu giải thích tiếng Việt hiện cạnh `SupportTag`. */
export const VERIFIER_FLAG_LABEL: Record<string, string> = {
  SOURCE_NOT_FOUND: 'Không tra ra nguồn này ở registry nào',
  EMPTY_ABSTRACT: 'Nguồn không có abstract để đối chiếu',
  STALE_SOURCE: 'Nguồn khá cũ so với khẳng định “mới nhất”',
  NUMBER_NOT_IN_SOURCE: 'Con số trong khẳng định không có trong abstract',
  FABRICATED_QUOTE: 'Câu trích dẫn không nằm trong abstract',
  DOI_UNVERIFIED: 'Chưa kiểm được DOI (registry không trả lời)',
  LLM_UNAVAILABLE: 'Không kiểm được bằng mô hình ở bước này',
  // Làn A · #2 — hai cờ của tầng đọc toàn văn.
  FULLTEXT_USED: 'Nhãn này đọc từ toàn văn bài báo, không chỉ abstract',
  FULLTEXT_UNAVAILABLE:
    'Không lấy được toàn văn — đã lùi về đối chiếu abstract',
};

/**
 * Làn A · #1 — mức tin cậy của nguồn.
 *
 * Ba mức, và **không mức nào dùng `danger`**: nguồn yếu không phải là *lỗi*, nó là thứ cần người
 * đọc cân nhắc. Dùng `danger` ở đây sẽ tranh chỗ với `UNSUPPORTED` — thứ thật sự chặn xuất bản.
 *
 * Điểm số không bao giờ hiện ra; thứ hiện ra là `label` cộng câu `reason` backend sinh sẵn
 * (tiêu chí hoàn thành của #1).
 */
export const CREDIBILITY_STYLE: Record<
  CredibilityTier,
  { label: string; className: string }
> = {
  HIGH: {
    label: 'Đáng tin',
    className: 'bg-ok-soft text-ok-strong border-ok-line',
  },
  MEDIUM: {
    label: 'Trung bình',
    className: 'bg-neutral-soft text-neutral-strong border-neutral-line',
  },
  REVIEW: {
    label: 'Cần cân nhắc',
    className: 'bg-warn-soft text-warn-strong border-warn-line',
  },
};

/** Làn A · #3 — nhãn tiếng Việt cho hai phạm vi xung đột và bốn tín hiệu phát hiện. */
export const CONFLICT_SCOPE_LABEL: Record<string, string> = {
  INTRA_CARD: 'Hai nguồn của cùng một thẻ nói ngược nhau',
  CROSS_CARD: 'Hai thẻ dùng cùng một bài báo theo hai chiều',
};

export const CONFLICT_SIGNAL_LABEL: Record<string, string> = {
  POLARITY: 'Trái chiều kết luận',
  NUMERIC: 'Lệch số liệu',
  DIRECTION: 'Trái chiều diễn đạt',
  LLM: 'Mô hình xác nhận',
};

/** Làn A · #5 — tên bảy tầng của verifier, hiện trên thanh truy vết. */
export const VERIFIER_LAYER_LABEL: Record<string, string> = {
  L0: 'Nguồn có thật',
  L1: 'Đủ dữ liệu',
  L2: 'Đối chiếu số',
  L3: 'Độ tương đồng',
  L3b: 'Đọc toàn văn',
  L4: 'Hỏi mô hình',
  L4b: 'Chống bịa trích',
};

/** Thứ tự hiển thị của thanh tầng — cũng là thứ tự chạy thật trong verifier. */
export const VERIFIER_LAYER_ORDER = [
  'L0',
  'L1',
  'L2',
  'L3',
  'L3b',
  'L4',
  'L4b',
] as const;
