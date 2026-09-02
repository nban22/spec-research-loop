# 03 · Tài liệu kiến trúc

> Sản phẩm bàn giao #3 · Trạng thái: **đủ**

Đề đòi *sơ đồ component + data flow + data model*. Cả ba đều có, vẽ bằng Mermaid nên xem thẳng trên
GitHub không cần công cụ. **Toàn bộ 6 file dưới đây nằm ngay trong thư mục này.**

## Đọc theo thứ tự này

| Thứ tự | File | Trả lời câu gì | Dòng |
| --- | --- | --- | --- |
| 1 | [ARCHITECTURE.md](ARCHITECTURE.md) | Dữ liệu, luồng, hợp đồng API, thuật toán verifier, thiết kế thí nghiệm | 938 |
| 2 | [STACK.md](STACK.md) | Dùng công nghệ gì — và **vì sao loại phương án khác** | 431 |
| 3 | [SYSTEM_DESIGN_ANALYSIS.md](SYSTEM_DESIGN_ANALYSIS.md) | Đánh đổi đã chấp nhận và **chỗ hệ thống sẽ vỡ** | 1.350 |
| 4 | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Token màu, chữ, bố cục responsive | 770 |
| — | [product-flow-map.html](product-flow-map.html) | Bản đồ luồng sản phẩm — **mở bằng trình duyệt** | tương tác |
| — | [lane-c-map.html](lane-c-map.html) | Bản đồ làn C: đã thêm gì, dựng bằng gì — **mở bằng trình duyệt** | tương tác |

Ranh giới giữa bốn file được giữ nghiêm: *công nghệ* → `STACK`, *màu và component* → `DESIGN_SYSTEM`,
*dữ liệu và luồng* → `ARCHITECTURE`, *chỗ vỡ* → `SYSTEM_DESIGN_ANALYSIS`. Không có nội dung nào nằm
ở hai file.

## Có gì trong ARCHITECTURE.md

| §  | Nội dung |
| --- | --- |
| §1.1 | Sơ đồ component + data flow toàn hệ thống |
| §1.2 | Sequence diagram vòng Judge — **đánh dấu 4 điểm dừng chờ người dùng** |
| §1.3 | Máy trạng thái 5 bước — mọi mũi tên tiến đều bắt đầu bằng ⏸ |
| §2.1–2.3 | 3 ERD: lõi · judge/issue/verifier/job · bảng phục vụ đánh giá |
| §2.4 | Bảng field đầy đủ, có kiểu và ràng buộc |
| §2.5 | **Quyết định chuẩn hoá / phi chuẩn hoá** — mỗi dòng ghi cả phương án đã loại và lý do |
| §2.6 | 10 sản phẩm bàn giao → chỗ nào trong data model |
| §3 | 16 chức năng → module + màn hình |
| §4 | 10 bước quy trình của đề → 5 bước wizard, kèm lý do gộp |
| §5 | Toàn bộ API surface |
| §6 | **Citation Verifier — thuật toán 5 tầng**, phần được thiết kế kỹ nhất |
| §7 | Thiết kế thí nghiệm 4 arm |
| §9 | Open questions — chỗ có thể quyết khác |

## Ba điều đọc ra được từ sơ đồ §1.1

Sơ đồ được vẽ như vậy để ba điều sau **nhìn là thấy**, không cần đọc chú thích:

1. **Mọi lời gọi DeepSeek đi qua đúng một cửa** (`llm.service`). Đó là điều kiện để `usage` và
   `prompt_hash` luôn được ghi — dữ liệu bắt buộc cho báo cáo đánh giá. Không có đường vòng.
2. **`Source` chỉ vào database từ nhánh `sources`.** Không có mũi tên nào từ `LLM` sang `Source`.
   Đây là cách kiến trúc chặn rủi ro "LLM bịa paper" — bằng hình dạng của đồ thị, không phải bằng
   lời dặn trong prompt.
3. **`eval` gọi thẳng service, không đi qua HTTP.** Nên 4 arm dùng chung đúng một đường ghi dữ
   liệu, không có nhánh code riêng cho baseline.

## Quy ước đọc

Tài liệu đánh dấu **[QĐ]** cho mọi quyết định mà *đề bài không nói* — kèm lý do, và phần lớn được
nhắc lại ở §9 nếu người đọc có thể muốn quyết khác. Chỗ nào là tái dựng từ ngữ cảnh chứ không phải
trích đề thì đánh **[TD]**. Mục đích: người chấm phân biệt được đâu là yêu cầu của đề, đâu là lựa
chọn của nhóm.

Tài liệu cũng mở đầu bằng một cảnh báo thay vì một lời quảng cáo: **file đề bài thiếu mục 7** (đánh
số nhảy từ "6. Sản phẩm bàn giao" sang "8. Tinh thần sáng tạo"), nhiều khả năng đó là rubric bị mất
khi export. Mọi kết luận về mức độ đáp ứng trong tài liệu là **suy luận** từ 16 chức năng và 10 sản
phẩm bàn giao, không phải trích rubric.
