---
stt: 021
timestamp: 2026-08-25T22:49+07:00
model: claude-opus-5
scope:
  - docs/product-flow-map.html
---

## Prompt

viết thành file html, tham khảo nội dung và format từ file @spec-research-loop/docs/automation-test-e2e-flow-map.html . Yêu cầu bỏ tab "Khái niệm", Hiển thị 4 tab tương ứng 4 tabs của websites "trang chủ", "dự án", "lịch sử phiên bản" và "trợ giúp". Mỗi tab hiển thị luồng behavior dưới góc nhìn product chứa tất cả các trường hợp có thể thao tác. Sau khi click vào các step, component thì hiển thị technical design, file nào gọi file nào, techstack là gì, sử dụng hạ tầng (db,..) gì, mục đích là gì.

(Bốn điểm đã chốt trước khi viết: node = màn hình/khối UI/hành động · tên file
`docs/product-flow-map.html` · gộp `/versions` và `/projects/:id/versions` vào một tab ·
toàn bộ tiếng Việt.)

## Kết quả

Thêm `docs/product-flow-map.html` — một file tĩnh tự chứa, không dependency ngoài, mở bằng
trình duyệt là chạy.

**Kế thừa từ `automation-test-e2e-flow-map.html`:** bố cục header + canvas + panel phải, làn
zone, node bấm được, đường nối SVG có nhãn số bước, panel hiện techstack/file/call, breadcrumb
neo bước. **Bỏ** tab "Khái niệm" và toàn bộ `#conceptsView`.

**Khác về bản chất:** node ở đây là **màn hình · khối UI · hành động của người dùng**, không
phải service backend như file gốc — đúng góc nhìn sản phẩm. Bốn zone: người dùng · màn hình ·
API · hạ tầng.

| Tab | Node | Đường nối | Bước |
| --- | --- | --- | --- |
| Trang chủ | 8 | 10 | 10 |
| Dự án | 16 | 22 | 22 |
| Lịch sử phiên bản | 6 | 5 | 5 |
| Trợ giúp | 6 | 5 | 5 |

Mỗi node có thêm mục **"Trường hợp thao tác"** — chỗ chứa các nhánh rẽ mà sơ đồ không vẽ được:
trạng thái rỗng, mọi lựa chọn A/B/C/Khác, nhãn GỢI Ý đảo theo `fits_rtx3090`, hai lớp khoá
nhảy cóc của stepper, và các nhánh lỗi (`JOB_ALREADY_RUNNING`, `VERSION_CONFLICT`,
`DECISION_ALREADY_APPLIED`, `OTHER_REASON_REQUIRED`, `JUDGE_QUORUM_NOT_MET`,
`PDF_ENGINE_UNAVAILABLE`, Semantic Scholar 429 → fallback OpenAlex).

Bốn nhánh được đánh dấu *"đã kiểm chứng khi chạy thật"* lấy từ lần chạy end-to-end cùng phiên:
429 rồi fallback vẫn gom được 23 nguồn · nhánh C của verifier gate mất 2 giây vì dựng bản nháp
bằng luật · `verifyJobId: null` khi có job cùng loại đang chạy mà apply vẫn thành công ·
mỗi lời gọi DeepSeek mất 75–85 giây.

Kiểm bằng Chromium thật: 4 tab render đủ, **0 lỗi console**, click node ra đủ 7 mục
(Mục đích · Techstack · Hạ tầng chạm tới · Trường hợp thao tác · Gọi ra · Được gọi từ ·
File liên quan).
