/**
 * Mã lỗi của backend → thông báo tiếng Việt. FE **không bao giờ** parse `message` để phân nhánh
 * logic (STACK §3.1 luật 3), và **không** in mã lỗi thô ra màn hình (DESIGN_SYSTEM §5.5 luật 6).
 *
 * Chuỗi mô tả trạng thái chờ cũng để ở đây, cùng lý do với ánh xạ enum: một nơi sửa,
 * không phải mười chỗ (§7.3).
 */

export const ERROR_MESSAGE: Record<string, string> = {
  VALIDATION_FAILED: 'Dữ liệu chưa hợp lệ. Kiểm tra lại các ô đã nhập.',
  NOT_FOUND: 'Không tìm thấy nội dung này.',
  INTERNAL_ERROR: 'Máy chủ gặp lỗi. Thử lại sau ít phút.',

  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  EMAIL_ALREADY_USED: 'Email này đã được đăng ký.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé.',
  REFRESH_TOKEN_INVALID: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé.',

  SOURCE_PROVIDER_UNAVAILABLE:
    'Không lấy được nguồn từ Semantic Scholar lẫn OpenAlex. Bước này dừng lại ở đây — hệ thống không tự nghĩ ra paper.',
  NO_SOURCES_YET: 'Chưa có nguồn nào. Hãy chạy tìm nguồn trước.',

  LLM_UNAVAILABLE: 'Không gọi được mô hình. Thử chạy lại bước này.',
  LLM_INVALID_JSON: 'Mô hình trả về dữ liệu không đúng khuôn. Thử chạy lại bước này.',

  JUDGE_ROUND_EXISTS: 'Vòng judge này đã chạy trên phiên bản hiện tại rồi.',
  JUDGE_ROUND_LIMIT: 'Đã dùng hết 3 vòng judge cho dự án này.',
  JUDGE_QUORUM_NOT_MET:
    'Có quá ít judge chạy được nên chưa tính được điểm đồng thuận. Hãy chạy lại.',

  DECISION_ALREADY_APPLIED: 'Quyết định này đã được áp dụng rồi.',
  VERSION_CONFLICT: 'Spec đã thay đổi ở nơi khác. Tải lại trang rồi chọn lại.',
  OTHER_REASON_REQUIRED: 'Chọn “Khác” thì bắt buộc nhập lý do.',
  DECISION_OPTION_UNKNOWN: 'Phương án này không còn trong danh sách. Tải lại rồi chọn lại.',

  EXPORT_BLOCKED_UNSUPPORTED_CITATION:
    'Còn trích dẫn chưa được nguồn hỗ trợ nên chưa xuất bản được.',
  EXPORT_BLOCKED_NOT_VERIFIED:
    'Phiên bản này chưa qua bước kiểm chứng cứ nên chưa xuất bản được.',
  PDF_ENGINE_UNAVAILABLE:
    'Máy chủ chưa dựng được PDF. Bản Markdown vẫn tải bình thường.',

  STEP_PRECONDITION_FAILED: 'Cần hoàn tất bước trước đã.',
  JOB_ALREADY_RUNNING: 'Một tiến trình cùng loại đang chạy. Đợi nó xong đã.',
};

export function messageOf(code: string | undefined, fallback?: string): string {
  if (code && ERROR_MESSAGE[code]) return ERROR_MESSAGE[code];
  return fallback ?? 'Đã có lỗi xảy ra. Thử lại nhé.';
}

/**
 * Câu mô tả "hệ thống đang làm gì" cho từng loại job. Luôn nói bằng chữ, tiếng Việt, kể cả khi
 * kết quả sinh ra là tiếng Anh (§5.5 luật 2).
 */
export const JOB_LABEL: Record<string, string> = {
  ANALYZE: 'Đang phân tích và phân rã ý tưởng…',
  SEARCH: 'Đang tìm nguồn trên Semantic Scholar và OpenAlex…',
  RELATED_WORK: 'Đang đọc abstract và dựng bảng nghiên cứu liên quan…',
  GENERATE: 'Đang sinh nội dung spec…',
  JUDGE: 'Đang chạy 5 judge độc lập…',
  VERIFY: 'Đang kiểm từng cặp (khẳng định, nguồn)…',
  EXPORT: 'Đang dựng file xuất bản…',
};

/** Quá ~60 giây thì thêm một dòng trấn an rằng job vẫn chạy (§5.5 luật 3). */
export const LONG_WAIT_HINT =
  'Việc này vẫn đang chạy ở máy chủ. Bạn có thể rời trang rồi quay lại — tiến độ không mất.';

export const SSE_LOST_HINT = 'Mất kết nối theo dõi, đang thử lại…';
