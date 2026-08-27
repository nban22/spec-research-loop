/**
 * Mã lỗi của backend → thông báo tiếng Việt. FE **không bao giờ** parse `message` để phân nhánh
 * logic (STACK §3.1 luật 3), và **không** in mã lỗi thô ra màn hình (DESIGN_SYSTEM §5.5 luật 6).
 *
 * Chuỗi mô tả trạng thái chờ cũng để ở đây, cùng lý do với ánh xạ enum: một nơi sửa,
 * không phải mười chỗ (§7.3).
 */

export const ERROR_MESSAGE: Record<string, string> = {
  VALIDATION_FAILED: 'Thông tin nhập vào chưa hợp lệ. Bạn vui lòng kiểm tra lại các ô đã nhập.',
  NOT_FOUND: 'Rất tiếc, hệ thống không tìm thấy nội dung bạn yêu cầu.',
  INTERNAL_ERROR:
    'Máy chủ đang gặp sự cố. Thành thật xin lỗi bạn, vui lòng thử lại sau ít phút.',

  INVALID_CREDENTIALS: 'Email hoặc mật khẩu chưa đúng. Bạn vui lòng kiểm tra lại.',
  EMAIL_ALREADY_USED:
    'Email này đã được đăng ký. Bạn vui lòng đăng nhập, hoặc dùng một email khác.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Bạn vui lòng đăng nhập lại.',
  REFRESH_TOKEN_INVALID: 'Phiên đăng nhập đã hết hạn. Bạn vui lòng đăng nhập lại.',

  SOURCE_PROVIDER_UNAVAILABLE:
    'Rất tiếc, hệ thống chưa lấy được nguồn từ Semantic Scholar lẫn OpenAlex nên xin phép dừng bước này. Hệ thống không tự nghĩ ra paper, để bảo đảm mọi trích dẫn bạn nhận được đều có thật.',
  NO_SOURCES_YET: 'Chưa có nguồn nào. Bạn vui lòng chạy tìm nguồn trước.',

  LLM_UNAVAILABLE: 'Hệ thống chưa gọi được mô hình. Bạn vui lòng chạy lại bước này.',
  LLM_INVALID_JSON:
    'Mô hình trả về dữ liệu chưa đúng khuôn. Bạn vui lòng chạy lại bước này.',

  JUDGE_ROUND_EXISTS:
    'Vòng judge này đã chạy trên phiên bản hiện tại. Bạn vui lòng tạo phiên bản mới trước khi chạy tiếp.',
  JUDGE_ROUND_LIMIT: 'Dự án này đã dùng hết 3 vòng judge theo quy định.',
  JUDGE_QUORUM_NOT_MET:
    'Số judge chạy được quá ít nên hệ thống chưa tính được điểm đồng thuận. Bạn vui lòng chạy lại.',

  DECISION_ALREADY_APPLIED: 'Quyết định này đã được áp dụng trước đó.',
  VERSION_CONFLICT:
    'Bản đặc tả đã thay đổi ở nơi khác. Bạn vui lòng tải lại trang rồi chọn lại.',
  OTHER_REASON_REQUIRED: 'Khi chọn “Khác”, bạn vui lòng nhập lý do.',
  DECISION_OPTION_UNKNOWN:
    'Phương án này không còn trong danh sách. Bạn vui lòng tải lại trang rồi chọn lại.',

  EXPORT_BLOCKED_UNSUPPORTED_CITATION:
    'Vẫn còn trích dẫn chưa được nguồn hỗ trợ, nên hệ thống xin phép chưa xuất bản.',
  EXPORT_BLOCKED_NOT_VERIFIED:
    'Phiên bản này chưa qua bước kiểm chứng cứ, nên hệ thống xin phép chưa xuất bản.',
  PDF_ENGINE_UNAVAILABLE:
    'Máy chủ chưa dựng được bản PDF, rất mong bạn thông cảm. Bản Markdown vẫn tải bình thường.',

  STEP_PRECONDITION_FAILED: 'Bạn vui lòng hoàn tất bước trước đã.',
  JOB_ALREADY_RUNNING:
    'Đang có một tiến trình cùng loại chạy. Bạn vui lòng đợi tiến trình đó hoàn tất.',
};

export function messageOf(code: string | undefined, fallback?: string): string {
  if (code && ERROR_MESSAGE[code]) return ERROR_MESSAGE[code];
  return fallback ?? 'Rất tiếc, đã có lỗi xảy ra. Bạn vui lòng thử lại.';
}

/**
 * Câu mô tả "hệ thống đang làm gì" cho từng loại job. Luôn nói bằng chữ, tiếng Việt, kể cả khi
 * kết quả sinh ra là tiếng Anh (§5.5 luật 2).
 */
export const JOB_LABEL: Record<string, string> = {
  ANALYZE: 'Hệ thống đang phân tích và phân rã ý tưởng của bạn…',
  SEARCH: 'Hệ thống đang tìm nguồn trên Semantic Scholar và OpenAlex…',
  RELATED_WORK: 'Hệ thống đang đọc abstract và dựng bảng nghiên cứu liên quan…',
  GENERATE: 'Hệ thống đang sinh nội dung đặc tả…',
  JUDGE: 'Hệ thống đang chạy 5 judge độc lập…',
  VERIFY: 'Hệ thống đang kiểm từng cặp (khẳng định, nguồn)…',
  EXPORT: 'Hệ thống đang dựng tệp xuất bản…',
};

/** Quá ~60 giây thì thêm một dòng trấn an rằng job vẫn chạy (§5.5 luật 3). */
export const LONG_WAIT_HINT =
  'Việc này vẫn đang chạy ở máy chủ. Bạn có thể rời trang rồi quay lại — tiến độ không bị mất.';

export const SSE_LOST_HINT = 'Mất kết nối theo dõi, hệ thống đang thử lại…';
