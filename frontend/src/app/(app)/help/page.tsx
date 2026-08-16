import { Panel } from '@/components/panel';
import { BookOpen, ShieldCheck, Scale, GitBranch } from 'lucide-react';

/**
 * Trang tĩnh một màn. Có trong nav của mockup nhưng **không** nằm trong 16 chức năng bắt buộc
 * (ARCHITECTURE §3, DESIGN_SYSTEM §9) — nên giữ đúng một màn, không mở rộng.
 */
export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-3 py-4 md:px-4">
      <h1 className="text-ink-1 text-xl font-semibold">Trợ giúp</h1>

      <Panel accent="brand" icon={BookOpen} title="Hệ thống làm gì">
        <p className="text-ink-2 text-sm leading-relaxed">
          Bạn nhập một ý tưởng nghiên cứu còn mơ hồ. Hệ thống diễn giải lại để bạn xác nhận nó
          hiểu đúng, phân rã thành thẻ, đi tìm tài liệu thật, rút ra khoảng trống nghiên cứu,
          dựng kế hoạch thí nghiệm, rồi cho 5 Judge phản biện độc lập. Kết quả là bản đặc tả
          nghiên cứu 14 mục, xuất được ra PDF và Markdown.
        </p>
      </Panel>

      <Panel accent="ok" icon={ShieldCheck} title="Vì sao mọi trích dẫn đều được gắn nhãn">
        <p className="text-ink-2 text-sm leading-relaxed">
          Mọi nguồn đều đến từ Semantic Scholar hoặc OpenAlex — hệ thống{' '}
          <strong>không được phép tự nghĩ ra paper</strong>. Với mỗi cặp (khẳng định, nguồn),
          bộ kiểm chứng cứ đối chiếu abstract thật rồi gắn nhãn SUPPORTED / WEAK / UNSUPPORTED.
          Còn nhãn UNSUPPORTED trên khẳng định, khoảng trống hay đóng góp thì chưa xuất bản được —
          đó là chủ ý, không phải lỗi.
        </p>
      </Panel>

      <Panel accent="decide" icon={Scale} title="Bạn luôn là người quyết định">
        <p className="text-ink-2 text-sm leading-relaxed">
          Không bước nào tự chốt. Mỗi thay đổi đều đi qua một lựa chọn của bạn, và mọi câu hỏi
          đều có phương án <strong>“Khác — tôi tự mô tả”</strong>. Lựa chọn nào cũng được ghi lại
          kèm thời điểm và lý do, hiện ở mục 14 của bản đặc tả.
        </p>
      </Panel>

      <Panel accent="neutral" icon={GitBranch} title="Phiên bản và lịch sử">
        <p className="text-ink-2 text-sm leading-relaxed">
          Mỗi lần bạn áp dụng một quyết định, hệ thống tạo một phiên bản mới thay vì sửa đè —
          nên bạn so được bất kỳ hai phiên bản nào và luôn thấy được đã đổi gì. Mỗi dự án chạy
          tối đa 3 vòng Judge.
        </p>
      </Panel>
    </div>
  );
}
