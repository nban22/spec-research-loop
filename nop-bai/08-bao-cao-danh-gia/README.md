# 08 · Báo cáo đánh giá hệ thống

> Sản phẩm bàn giao #8 · Trạng thái: **báo cáo đầy đủ khung + có số thật** · cỡ mẫu **n = 1**, bảng
> chi phí chờ batch — §4

**File chính: [evaluation_report.md](evaluation_report.md)** — 601 dòng.

| Trong thư mục này | |
| --- | --- |
| [evaluation_report.md](evaluation_report.md) | **Báo cáo đánh giá** — §1–§6 + Phụ lục A + Phụ lục C |
| [deliverables_plan.md](deliverables_plan.md) | Bốn yêu cầu bắt buộc đáp ứng tới đâu, và cách hoàn thành nốt |
| [handover.md](handover.md) | Bảng đối chiếu 10 sản phẩm bàn giao + việc còn lại |

---

## 1. Báo cáo trả lời đúng ba câu đề chốt

| Câu của đề | Mục |
| --- | --- |
| *Cải tiến này giải quyết vấn đề gì* | §1 |
| *Được kiểm nghiệm như thế nào* | §2 — thiết kế thí nghiệm, 4 arm, điều kiện công bằng |
| *Kết quả có tốt hơn baseline không* | §3 — bảng số + phần đọc bảng |

Ba mục còn lại là ba mục hay bị thiếu nhất trong báo cáo sinh viên:

| § | Nội dung | Vì sao quan trọng |
| --- | --- | --- |
| §4 | **Bug thật do việc chạy thí nghiệm phát hiện** | Bằng chứng thí nghiệm được chạy thật, không phải dựng bảng cho đẹp |
| §5 | **Limitation — ghi ra trước khi bị hỏi** | Một báo cáo giấu giới hạn thì mọi con số còn lại mất giá trị |
| §6 | **Việc còn lại để báo cáo hoàn chỉnh** | 8 dòng, mỗi dòng ghi rõ vì sao cần |

Cộng hai phụ lục:

- **Phụ lục A** — bốn cơ chế của làn A, ablation ba cấu hình, và §A.4 *"những chỗ **không** cải
  thiện"*, mục được ghi chú là mục quan trọng nhất của phụ lục.
- **Phụ lục C** — chi phí theo arm, theo bước, chi phí biên theo cặp ý tưởng, hai kịch bản giá, và
  §C.10 *"kết luận ĐƯỢC rút và KHÔNG được rút"*.

---

## 2. Kết quả chính

| Metric | B1 single-shot | B2 pipeline | Hướng tốt |
| --- | --- | --- | --- |
| **Citation validity** | **0,400** | **1,000** | ↑ |
| **Spec completeness (/14)** | **6** | **14** | ↑ |

Bảng đầy đủ 8 metric và phần đọc bảng: [07-baseline/README.md](../07-baseline/README.md) §3.

Điểm đáng chú ý: **B1 bịa 60% số paper nó trích**. Không phải model kém — đó là hệ quả tất yếu của
kiến trúc single-shot, nơi model được phép nói về tài liệu mà không có đường nào để tra. Đây là lý
do dự án không chống bịa bằng prompt mà chống bằng **hình dạng của luồng dữ liệu**.

---

## 3. Ba metric đo được cái mà đề bài thật sự hỏi

Đề liệt kê sáu điều mà một cơ chế mới có thể cải thiện. Dự án chọn **đúng một** và đo nó, thay vì
làm ba cái nửa vời:

| Đề liệt kê | Metric trong báo cáo | Đo bằng |
| --- | --- | --- |
| Giảm claim không có bằng chứng ↓ | `citation_validity` · `unsupported_rate` | `EvalMetric` |
| Tạo experiment plan đầy đủ hơn ↑ | `completeness_14` | `EvalMetric` |
| Giảm chi phí hoàn thiện spec ↓ | `total_tokens` · `wall_ms` · bảng USD ở §C | tổng hợp từ `LlmCall` |

Mọi con số đến từ database, không phải từ ghi chép tay: **mọi** lời gọi LLM đều đi qua một cửa duy
nhất (`llm.service`) và ghi lại `prompt_tokens`, `completion_tokens`, `cache_hit_tokens`,
`latency_ms`, `attempts`, `prompt_hash`. Không có lời gọi nào thoát khỏi sổ sách.

---

## 4. Điều phải nói rõ

**Cỡ mẫu hiện tại là n = 1 ý tưởng × 2 arm.** Trong file
[`summary.csv`](../07-baseline/ket-qua-do-duoc/aa000000-0000-4000-8000-000000000001-summary.csv),
cột `B1_std` và `B2_std` đều bằng `0.0000` — dấu hiệu trực tiếp của n = 1, không có phương sai để
nói. Điều này được ghi ở đầu báo cáo, ở §6 của báo cáo, ở đây, ở [07-baseline/](../07-baseline/) và
ở trang đầu hồ sơ. Không có chỗ nào trình bày nó như một kết quả đầy đủ.

**Bảng chi phí ở Phụ lục C đang để trống**, chờ đúng batch đó. Hạ tầng `eval:cost` đã xong và
**không tốn thêm lời gọi LLM nào** để điền.

**Mọi con số USD hiện là token đổi đơn vị bằng một hằng số chưa có nguồn.** File
`backend/eval/pricing.json` ghi thẳng điều đó trong trường `_source`. Việc cần làm là 15 phút tra
bảng giá chính thức của DeepSeek.

**Chưa có biểu đồ cột** cho 4 metric chính — đề §7.4 yêu cầu tường minh, hiện mới có bảng.

Bốn dòng trên là toàn bộ khoảng cách giữa báo cáo này và một báo cáo hoàn chỉnh. Ba trong bốn dòng
đóng lại bằng **cùng một lần chạy máy**.

---

## 5. Hai chỗ báo cáo tự phản bác chính nó

Đây là hai mục nên đọc kỹ, vì chúng cho biết báo cáo được viết để tìm sự thật chứ không để bảo vệ
kết luận:

**§3 mục ③** — `unsupported_rate` của B2 cao hơn B1, và báo cáo **không** lấy đó làm bằng chứng B2
tệ hơn. Nó chỉ ra rằng hai arm đang đo hai mẫu số khác nhau nên con số **chưa so trực tiếp được**,
rồi đưa việc sửa vào danh sách việc còn lại.

**§A.4 "Những chỗ không cải thiện"** — cơ chế đọc toàn văn arXiv có `fulltext_hit_rate = 0` trên tập
thử, vì hai dự án được thử không có nguồn arXiv nào. Báo cáo nói rõ *"cơ chế chạy đúng, chỉ là không
có gì để đọc"*, và thừa nhận mốc "không quá 2× thời gian" đạt được **phần lớn vì độ phủ thấp**, chứ
không phải vì toàn văn rẻ.

---

## 6. Đọc kèm

| File | Nội dung |
| --- | --- |
| [deliverables_plan.md](deliverables_plan.md) | Bốn yêu cầu bắt buộc đáp ứng tới đâu, kèm cách hoàn thành từng cái |
| [handover.md](handover.md) | Đối chiếu 10 sản phẩm bàn giao + việc còn lại |
