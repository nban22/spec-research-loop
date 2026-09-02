# 06 · Cơ chế kiểm tra citation / evidence

> Sản phẩm bàn giao #6 · Trạng thái: **cơ chế đủ và chạy được** · **chưa validate bằng nhãn người** —
> nói rõ ở §5
>
> Đây cũng là **cơ chế mới** dùng để chứng minh bằng số ở sản phẩm bàn giao #8. Một mũi tên hai đích,
> và đó là lý do nó được thiết kế kỹ nhất trong dự án.

Mã nguồn: [`verifier-source/`](verifier-source/) — 21 file, bản chép của `backend/src/verifier/` · Thuật toán đầy đủ:
[ARCHITECTURE.md §6](../03-tai-lieu-kien-truc/ARCHITECTURE.md)

---

## 1. Vấn đề — hai kiểu sai, không phải một

| Kiểu sai | Ví dụ | Bắt bằng gì |
| --- | --- | --- |
| **Nguồn không tồn tại** | Trích *"Smith et al., 2023, Prompt Distillation"* — không có paper nào như vậy | Rule, 0 token |
| **Nguồn có thật nhưng không nói điều claim nói** | Trích đúng một paper rồi gán cho nó con số *"giảm 20% unsupported claims"* mà paper không hề có | Phải đọc abstract |

Phần lớn hệ thống chỉ nghĩ tới kiểu thứ nhất. Kiểu thứ hai mới là kiểu nguy hiểm, vì nó **qua được**
mọi kiểm tra hình thức: DOI tra ra, tên tác giả đúng, năm đúng — chỉ nội dung là sai.

**Kiểu thứ nhất bị chặn bằng kiểu dữ liệu, không phải bằng kiểm tra.** Enum `Source.retrieved_from`
nhận `SEMANTIC_SCHOLAR | OPENALEX | ARXIV | CROSSREF` và **không có giá trị `LLM`**. Không tồn tại
đường ghi nào để một paper do model nghĩ ra vào được bảng `Source`. Đây là khác biệt giữa *"chúng tôi
kiểm tra citation"* và *"citation bịa không biểu diễn được trong hệ thống này"*.

---

## 2. Thuật toán — 5 tầng, rẻ trước đắt sau

```
        cặp (claim, Source)
                │
   L0 · Nguồn có tồn tại?              rule · 0 token
        │  DOI tra Crossref · title similarity ≥ 0,85
        │  hỏng ⇒ UNSUPPORTED + flag SOURCE_NOT_FOUND ■ DỪNG
                │
   L1 · Sanity metadata                rule · 0 token
        │  abstract rỗng/quá ngắn ⇒ flag EMPTY_ABSTRACT, trần nhãn = WEAK
        │  nguồn quá cũ mà claim nói "recent/SOTA" ⇒ flag STALE_SOURCE
                │
   L2 · Đối chiếu từ vựng và CON SỐ    rule · 0 token
        │  claim có số/đơn vị không xuất hiện trong abstract
        │  ⇒ flag NUMBER_NOT_IN_SOURCE, trần nhãn = WEAK
                │
   L3 · Embedding similarity           all-MiniLM-L6-v2 · CPU local · 0 token API
        │  sim < τ_low  = 0,35 ⇒ UNSUPPORTED ■ DỪNG, không gọi LLM
        │  sim ≥ τ_high = 0,72 và không flag ⇒ SUPPORTED ■ DỪNG, không gọi LLM
        │  vùng xám ↓
        │
   L3b · Leo thang đọc TOÀN VĂN arXiv  (tuỳ chọn, cờ evidence_fulltext)
                │
   L4 · LLM entailment                 deepseek-v4-flash · temp 0 · JSON mode
        │
   L4b · evidence_sentence có phải substring THẬT của abstract?   rule
        │  không phải ⇒ hạ nhãn. Đây là rule kiểm lại chính output của LLM
                │
   L5 · Bảng quyết định nhãn (rule)
                ↓
   support_label · similarity · entailment · confidence · evidence_sentence · flags[]
                → ghi vào CardSource
```

### Vì sao xếp tầng như vậy

**Ba tầng đầu chặn phần lớn lỗi mà không tốn một token API nào.** Mục tiêu đặt ra từ đầu: chi phí
LLM cho việc kiểm tra phải **dưới 15% tổng token của một spec**. Con số đó quan trọng ngang con số
chất lượng — nếu verifier tốn bằng cả pipeline thì nó không phải cải tiến, chỉ là một cách tiêu tiền.

**Tầng L4b là chi tiết đáng chú ý nhất.** Sau khi LLM trả lời, một **rule** kiểm lại chính output
đó: câu `evidence_sentence` mà LLM nói là bằng chứng **bắt buộc phải là substring có thật của
abstract**. Không phải thì hạ nhãn. Nghĩa là hệ thống không tin LLM ở bước cuối cùng — kể cả khi LLM
đang làm nhiệm vụ chống LLM bịa.

**Tầng L2 — numeric guard** là luật quan trọng nhất trong nhóm rule: trích mọi số kèm đơn vị trong
claim rồi đối chiếu với abstract. Đây chính là tầng bắt được kiểu sai *"paper có thật, con số bịa"*.

---

## 3. Gắn nhãn là báo cáo. **Chặn** mới là cơ chế.

Điểm này quyết định #6 có phải một cơ chế thật hay chỉ là trang trí:

```
POST /spec-versions/:id/export
  → 409 EXPORT_BLOCKED_UNSUPPORTED_CITATION
```

Khi spec còn citation `UNSUPPORTED` trên thẻ `CLAIM` / `GAP` / `CONTRIBUTION` / `EVIDENCE`, hệ thống
**từ chối xuất bản**. Người dùng phải sửa claim, đổi nguồn, hoặc ghi lý do ghi đè — và lý do đó được
lưu vào `CardSource.override_reason`, không cho bỏ qua trong im lặng.

Cờ `Project.verifier_gate` bật/tắt hành vi này, và chính nó là cần gạt của arm ablation
`SYS_NO_VERIFY` trong báo cáo đánh giá.

**Verifier chạy hai vai tách rời:** vai *đo* chạy cho **mọi** arm kể cả B1 — đó là cách duy nhất có
được cùng một thước cho baseline; vai *can thiệp* (chặn export) chỉ có ở `SYS`.

---

## 4. Đầu ra — mỗi cặp được ghi gì

| Cột `CardSource` | Nội dung |
| --- | --- |
| `support_label` | `SUPPORTED` · `WEAK` · `UNSUPPORTED` |
| `similarity` | `sim_max` của tầng L3 |
| `entailment` | `ENTAILS` · `PARTIAL` · `NOT_ENTAILED` · `CONTRADICTS` |
| `confidence` | độ chắc chắn do L4 trả về |
| `evidence_sentence` | **câu thật trong abstract** đỡ cho claim — đã qua kiểm substring ở L4b |
| `flags` | `NUMBER_NOT_IN_SOURCE` · `STALE_SOURCE` · `EMPTY_ABSTRACT` · `SOURCE_NOT_FOUND` |
| `verifier_run_id` | nhãn này do lần chạy nào sinh ra |

Giao diện có màn **"Vì sao nhãn này"**: chỉ đúng câu trong paper và đúng tầng đã ra quyết định
([`verifier-source/layer-trace.ts`](verifier-source/layer-trace.ts)). Người dùng không phải tin nhãn — họ đọc được lý do.

**Verifier không sửa nội dung thẻ.** Nó chỉ gắn nhãn; sửa là việc của người dùng qua một `Decision`.
Ranh giới này giữ đúng nguyên tắc human-in-the-loop của đề.

---

## 5. Điều phải nói rõ

**Chưa validate bằng nhãn người.** 30 cặp đã được chấm mù nhưng **do một mô hình khác nhà cung cấp**
(xem [04-dataset-use-case/](../04-dataset-use-case/)). Kết quả đối chiếu: khớp **4/5 trên thẻ
`CLAIM`**. Cho tới khi có 20 cặp người gán tay, mọi nhãn của verifier vẫn ở mức *"máy nói vậy"*.

**Ngưỡng là số chọn, không phải số đo.** `τ_low = 0,35` · `τ_high = 0,72` · `conf_min = 0,70`
([`verifier-source/thresholds.ts`](verifier-source/thresholds.ts)). Dữ liệu hiện có đã cho thấy `τ_high` gần như chắc chắn phải
hạ. Công cụ hiệu chỉnh [`../07-baseline/eval-source/calibrate.ts`](../07-baseline/eval-source/calibrate.ts) đã viết — và chính lần đối chiếu chéo đã phát
hiện nó **chưa hiệu chỉnh được từ dữ liệu đang lưu**, một lỗi thật cần sửa trước khi dùng.

Hai điều này là khoảng trống lớn nhất của đồ án và **không sửa được bằng cách viết thêm code**.

---

## 6. Kiểm bằng tay trong 3 phút

1. Vào một dự án đã có nguồn, mở bước 5.
2. Bấm chạy verifier → mỗi cặp (claim, nguồn) hiện một nhãn.
3. Bấm vào một nhãn → xem câu trích và tầng đã quyết định.
4. Bấm xuất PDF khi còn nhãn `UNSUPPORTED` → **bị chặn**, kèm mã lỗi.

Test tự động phủ phần này: [`verifier-source/*.spec.ts`](verifier-source/) — trong đó
`numeric-guard.spec.ts`, `replay.spec.ts`, `metrics.spec.ts` khoá đúng ba hành vi dễ vỡ nhất.
