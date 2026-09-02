# 07 · Ít nhất hai baseline

> Sản phẩm bàn giao #7 · Trạng thái: **4 arm đã cài đặt — vượt yêu cầu 2 baseline** · số liệu hiện
> có **n = 1 ý tưởng × 2 arm**, batch đầy đủ là một lệnh chưa chạy — §4

| Trong thư mục này | |
| --- | --- |
| [eval-source/](eval-source/) | **Bộ đánh giá đầy đủ** — bản chép của `backend/eval/`. Điểm vào: [`harness.ts`](eval-source/harness.ts) (định nghĩa 4 arm) · [`run-eval.ts`](eval-source/run-eval.ts) · [`score.ts`](eval-source/score.ts) · [`audit.ts`](eval-source/audit.ts) (chấm blind) · [`cost-report.ts`](eval-source/cost-report.ts) · [`calibrate.ts`](eval-source/calibrate.ts) |
| [ket-qua-do-duoc/](ket-qua-do-duoc/) | Kết quả thô của các batch đã chạy — `summary.csv` là bảng số ở §3 |
| [eval-source/pricing.json](eval-source/pricing.json) | Đơn giá dùng để quy ra USD — **`_source` ghi rõ đơn giá này chưa chốt nguồn** |

---

## 1. Bốn arm

Đề đòi *ít nhất hai baseline*. Dự án có bốn nhánh, trong đó ba cặp so sánh tách được **ba đóng góp
kiến trúc khác nhau** — đó là lý do làm bốn thay vì hai.

| Arm | Là gì | Cặp so sánh đo được điều gì |
| --- | --- | --- |
| `B1` | **Single-shot** — một prompt ra thẳng spec 14 mục (`prompts/baseline_b1.md`) | sàn dưới |
| `B2` | Pipeline đầy đủ **trừ** vòng judge | `B1 → B2` = đóng góp của *tìm nguồn thật + phân rã có cấu trúc* |
| `SYS` | Hệ đầy đủ: 5 judge + vòng sửa + verifier gate | `B2 → SYS` = đóng góp của *vòng judge* |
| `SYS_NO_VERIFY` | `SYS` nhưng `verifier_gate = false` | `SYS−V → SYS` = đóng góp của *citation verifier* |

Arm thứ tư là **ablation của chính cơ chế mới**. Không có nó thì không trả lời được câu "cải tiến
của bạn đóng góp bao nhiêu" — chỉ trả lời được "cả hệ thống tốt hơn baseline", vốn là câu yếu hơn
nhiều.

## 2. Điều kiện công bằng — đã giữ những gì

Một so sánh baseline chỉ có nghĩa nếu các arm thật sự ăn cùng một thứ. Sáu điều kiện dưới đây được
ép trong code, không phải quy ước:

- **Cùng base model theo vai** (`deepseek-v4-pro` / `deepseek-v4-flash`), `temperature: 0` cho
  **mọi** lời gọi.
- **Cùng một `ScriptedDecisionPolicy`** cho mọi arm: luôn chọn phương án được `recommended`, không
  có thì chọn `A`, **không bao giờ chọn `Other`**. Deterministic, không random, không LLM. Nghĩa là
  khác biệt giữa các arm không đến từ việc "người dùng giả" ở arm này khôn hơn arm kia.
- **Eval đi qua đúng service của app**, không có nhánh code riêng cho baseline. Cả bốn arm ghi vào
  **cùng bộ bảng**, nên một câu SQL tính metric cho cả bốn. B1 cũng tạo `Project` và `SpecVersion`
  thật, chỉ khác là nó có đúng 1 version với các `Card` parse ra từ output single-shot.
- **Chạy xen kẽ theo ý tưởng và hoán vị thứ tự arm** theo chỉ số ý tưởng, để arm chạy sau không được
  lợi từ `Source` mà arm trước đã nạp sẵn vào database.
- **Verifier chạy vai *đo* cho mọi arm kể cả B1** — cách duy nhất có cùng một thước cho baseline.
  Vai *can thiệp* (chặn export) chỉ bật ở `SYS`.
- **`score.ts` từ chối tổng hợp** nếu một `prompt_id` có hai `prompt_hash` khác nhau trong cùng
  batch — không thể vô tình trộn kết quả của hai phiên bản prompt.

## 3. Kết quả đã đo được

Batch `aa000000-…0001` · 2026-08-16 · **n = 1 ý tưởng (I01) · arm B1 và B2**
Nguồn: [`ket-qua-do-duoc/aa000000-…-summary.csv`](ket-qua-do-duoc/aa000000-0000-4000-8000-000000000001-summary.csv)

| Metric | B1 single-shot | B2 no-judge | Hướng tốt |
| --- | --- | --- | --- |
| **Citation validity** | **0,400** | **1,000** | ↑ |
| Unsupported claim rate | 0,600 | 0,917 | ↓ |
| **Spec completeness (/14)** | **6** | **14** | ↑ |
| MAJOR + CRITICAL issues | 0 | 0 | ↓ |
| JSON validity (lần đầu) | 1,000 | 0,688 | ↑ |
| Tỉ lệ unit phải xuống tầng L4 | 0,000 | 0,917 | ↓ |
| Token / spec | 3.902 | 128.406 | ↓ |
| Thời gian (giây) | 36 | 472 | — |

### Đọc bảng này

**① Citation validity 0,40 → 1,00 là kết quả chính, và nó không cãi được.** B1 trích 5 paper từ trí
nhớ của model; tra lại bằng Semantic Scholar/OpenAlex thì **chỉ 2 cái tồn tại — 60% là bịa**. B2 đạt
1,00 **theo cấu trúc chứ không nhờ may**: mọi nguồn của nó đến từ API thật và mang `external_id`,
nên không có gì để bịa. Đây đúng là điều kiến trúc hứa ở §1.1 của tài liệu kiến trúc.

**② Completeness 6/14 → 14/14.** Single-shot bỏ trống hơn một nửa số mục bắt buộc của một research
spec. Đây là lý do "một prompt tốt" không thay thế được pipeline.

**③ `unsupported_rate` của B2 cao hơn B1 — và đó KHÔNG phải B2 tệ hơn.** Hai arm đang đo hai thứ
khác nhau vì mẫu số khác nhau: với B1 mẫu số là 5 trích dẫn *tự nhớ* và câu hỏi là "có tra ra
không"; với B2 mẫu số là 12 cặp (claim, nguồn) *có thật* và câu hỏi khó hơn hẳn — "abstract có thật
sự đỡ cho claim không". **Hai con số này chưa so trực tiếp được**, và việc sửa cách tính nằm trong
danh sách việc còn lại ở §6 báo cáo đánh giá.

Mục ③ được viết ra thay vì bỏ đi vì nó là chỗ dễ bị hỏi nhất khi bảo vệ, và trả lời trước thì tốt
hơn bị bắt.

**④ Token 3.902 → 128.406 là cái giá phải trả, ghi ra chứ không giấu.** Đổi lấy citation validity
gấp 2,5 lần và completeness gấp 2,3 lần. Bảng chi phí chi tiết theo từng bậc kiến trúc nằm ở Phụ lục
C của báo cáo đánh giá.

## 4. Việc còn lại — một lệnh

```bash
cd backend
npm run eval:run -- --arms=B1,B2,SYS,SYS_NO_VERIFY --limit=10   # ~2 giờ · ~7,8 triệu token
npm run eval:audit -- --batch=<uuid>     # PHẢI chạy trước eval:score
npm run eval:score -- --batch=<uuid>
npm run eval:cost  -- --batch=<uuid>     # không tốn thêm lời gọi LLM nào
```

**Thứ tự bắt buộc, sai là hỏng số:** `eval:audit` phải chạy **trước** `eval:score`, vì auditor chấm
mù — chấm sau khi đã thấy bảng điểm thì không còn mù nữa. `eval:cost` chạy cuối vì nó đọc file kết
quả của `eval:score` để dùng đúng tập lượt đó.

Toàn bộ hạ tầng cho lệnh trên **đã chạy được**; thứ còn thiếu là thời gian máy, không phải code.

## 5. Kết quả ablation của làn A — và vì sao nó chưa kết luận được gì

`ket-qua-do-duoc/a0000000-…-evidence.json` · 2 ý tưởng × 3 cấu hình · 2026-09-01.

Bảng này được nộp kèm **kể cả khi nó không cho kết luận đẹp**, vì hai lý do nó thất bại đều là phát
hiện có giá trị:

1. **`fulltext_hit_rate = 0`** — hai dự án của nhánh toàn văn không có lấy một nguồn arXiv nào
   (I01: 10 nguồn, 0 arXiv; I02: 23 nguồn, 0 arXiv). Tầng L3b vẫn leo thang đúng 14 lần và cả 14
   lần đều dừng ở `NOT_ARXIV` — **cơ chế chạy đúng, chỉ là không có gì để đọc**. Đã kiểm riêng để
   chắc đây không phải lỗi nhận diện: `detectArxivId` bắt đúng 10/10 nguồn có dấu vết arXiv.
2. **Chênh lệch giữa ba dòng là nhiễu, không phải tín hiệu** — và đây là **khiếm khuyết thiết kế của
   chính script ablation đó**: mỗi nhánh tự chạy lại generator nên ba nhánh không dùng chung một tập
   khẳng định.

Một thí nghiệm hỏng được mô tả đúng vẫn có ích hơn một thí nghiệm hỏng được trình bày như thành công.
