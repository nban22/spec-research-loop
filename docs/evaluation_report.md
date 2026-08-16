# BÁO CÁO ĐÁNH GIÁ HỆ THỐNG — SpecResearch Loop

> **Deliverable #8.** Trả lời đúng ba câu mà đề chốt lại ở cuối bài:
> *cải tiến này giải quyết vấn đề gì · được kiểm nghiệm như thế nào · kết quả có tốt hơn baseline không.*
>
> Status: **bản khởi đầu — có số thật, chưa đủ cỡ mẫu.** Batch đã chạy là
> `aa000000-0000-4000-8000-000000000001`, ngày 2026-08-16, gồm **1 ý tưởng × 2 arm (B1, B2)**.
> Bảng đầy đủ 10 ý tưởng × 4 arm chưa chạy — xem §6.

---

## 1. Cải tiến được đề xuất là gì

**Citation Verifier 5 tầng, rẻ trước đắt sau** (`backend/src/verifier/`, thuật toán ở
`ARCHITECTURE.md` §6).

Vấn đề nó nhắm vào: một hệ sinh spec bằng LLM có **hai** kiểu sai citation, khác hẳn nhau về bản chất.

| Kiểu sai | Ví dụ | Ai bắt được |
| --- | --- | --- |
| **Nguồn không tồn tại** | Trích "Smith et al., 2023, *Prompt Distillation*" — không có paper nào như vậy | Rule, 0 token |
| **Nguồn có thật nhưng không nói điều claim nói** | Trích đúng một paper rồi gán cho nó con số "giảm 20%" mà paper không hề có | Cần đọc abstract |

Kiến trúc chặn kiểu thứ nhất **bằng kiểu dữ liệu**: enum `Source.retrieved_from` **không tồn tại
giá trị `LLM`**, nên không có đường ghi nào để một paper do model nghĩ ra vào được bảng. Kiểu thứ
hai đi qua năm tầng, trong đó **chỉ tầng L4 gọi LLM**, và **L4b là rule kiểm lại output của LLM**
(câu trích dẫn phải là substring có thật của abstract).

Gắn nhãn thôi thì chưa phải cơ chế; **chặn** mới là cơ chế: `POST /spec-versions/:id/export` trả
`409 EXPORT_BLOCKED_UNSUPPORTED_CITATION` khi còn nhãn `UNSUPPORTED` trên thẻ claim/gap/contribution.

---

## 2. Thiết kế thí nghiệm

**Tập test:** `backend/eval/ideas.json` — 10 ý tưởng mơ hồ trải trên 10 domain (deliverable #4).

**Bốn arm** (deliverable #7 — hai baseline B1, B2 cộng một arm ablation):

| Arm | Là gì | Cặp so sánh đo được điều gì |
| --- | --- | --- |
| `B1` | Single-shot: một prompt → spec 14 mục | sàn dưới |
| `B2` | Pipeline đầy đủ **trừ** vòng judge | `B1→B2` = đóng góp của *retrieval + phân rã có cấu trúc* |
| `SYS` | Hệ đầy đủ: 5 judge + vòng sửa + verifier gate | `B2→SYS` = đóng góp của *vòng judge* |
| `SYS_NO_VERIFY` | `SYS` nhưng `verifier_gate = false` | `SYS−V→SYS` = đóng góp của *citation verifier* |

**Điều kiện công bằng đã giữ:**

- Cùng base model theo vai (`deepseek-v4-pro` / `deepseek-v4-flash`), `temperature: 0` **mọi** lời gọi.
- **Cùng một `ScriptedDecisionPolicy`** cho mọi arm: luôn chọn phương án được `recommended`, không
  có thì chọn `A`, **không bao giờ chọn `Other`**. Deterministic, không random, không LLM.
- Eval **đi qua đúng service của app**, không có nhánh code riêng — cả bốn arm ghi vào **cùng bộ
  bảng**, nên một câu SQL tính metric cho cả bốn.
- Chạy **xen kẽ theo ý tưởng** và **hoán vị thứ tự arm** theo chỉ số ý tưởng, để arm chạy sau
  không được lợi từ `Source` đã nằm sẵn trong DB.
- `score.ts` **từ chối tổng hợp** nếu một `prompt_id` có hai `prompt_hash` khác nhau trong cùng batch.

**Verifier chạy hai vai tách rời:** vai *đo* chạy cho **mọi** arm kể cả B1 — đó là cách duy nhất
có được cùng một thước cho baseline; vai *can thiệp* (chặn export) chỉ có ở `SYS`.

---

## 3. Kết quả đã đo được

Batch `aa000000-…0001` · 2026-08-16 · **n = 1 ý tưởng (I01)** · arm B1 và B2.
Nguồn số: `backend/eval/results/aa000000-0000-4000-8000-000000000001-summary.csv`.

| Metric | B1 Single-shot | B2 No-Judge | Hướng tốt |
| --- | --- | --- | --- |
| **Citation validity** | **0.400** | **1.000** | ↑ |
| Unsupported claim rate | 0.600 | 0.917 | ↓ |
| **Spec completeness (/14)** | **6** | **14** | ↑ |
| MAJOR + CRITICAL issues | 0 | 0 | ↓ |
| JSON validity (lần đầu) | 1.000 | 0.688 | ↑ |
| Tỉ lệ unit xuống tầng L4 | 0.000 | 0.917 | ↓ |
| Token / spec | 3.902 | 128.406 | ↓ |
| Thời gian (s) | 36 | 472 | — |

### Đọc bảng này

**① Citation validity 0.40 → 1.00 là kết quả chính, và nó không cãi được.**
B1 trích 5 paper từ trí nhớ của model; tra lại bằng Semantic Scholar/OpenAlex thì **chỉ 2 cái tồn
tại** — 60% là bịa. B2 đạt 1.00 **theo cấu trúc**, không phải nhờ may: mọi nguồn của nó đến từ API
thật và mang `external_id`, nên không có gì để bịa. Đây đúng là điều kiến trúc hứa.

**② Completeness 6/14 → 14/14.** Single-shot bỏ trống hơn một nửa số mục bắt buộc.

**③ `unsupported_rate` của B2 cao hơn B1 — và đó KHÔNG phải B2 tệ hơn.** Hai arm đang đo hai thứ
khác nhau vì bản chất dữ liệu khác nhau: với B1, mẫu số là 5 trích dẫn *tự nhớ*, và metric hỏi
"có tra ra không". Với B2, mẫu số là 12 cặp (claim, nguồn) *có thật*, và metric hỏi câu khó hơn
nhiều: "abstract này có **thật sự** nói điều claim nói không". B2 bị chấm bằng một thước chặt hơn
hẳn. **Con số 0.917 của B2 là phát hiện thật và đáng lo**: pipeline gắn nguồn quá rộng tay —
nguồn cùng chủ đề nhưng không chống lưng đúng khẳng định. Đây chính là loại lỗi mà vòng judge và
verifier gate (arm `SYS`) sinh ra để xử lý, và là lý do arm `SYS` **phải** được chạy trước khi
báo cáo này kết luận được điều gì về cơ chế mới.
→ Việc phải sửa trước batch đầy đủ: hoặc siết `generator_contribution.md` về việc đính nguồn, hoặc
báo cáo hai metric tách bạch (`unsupported_rate` trên nguồn-có-thật vs `fabrication_rate`).

**④ `l4_llm_ratio = 0.917` vượt xa thiết kế.** `ARCHITECTURE.md` §6.3 đặt mục tiêu chỉ 30–40% unit
rơi vào vùng xám và phải gọi LLM; thực tế 91.7%. Nguyên nhân: `τ_high = 0.72` quá cao so với phân
bố cosine thật của cặp (claim, câu abstract) — hầu như không unit nào được kết luận sớm ở L3.
Chi phí verifier vì thế cao hơn dự kiến. **Đây là số cần để hiệu chỉnh ngưỡng**, và nó chỉ lộ ra
khi chạy thật — đúng như `SYSTEM_DESIGN_ANALYSIS` C2 · F.3 đã ghi trước là `[❓CẦN XÁC NHẬN]`.

**⑤ JSON validity của B2 = 0.688.** 5/16 lời gọi phải retry. Vòng retry có đính kèm lỗi zod vào
lượt sau nên **không lời gọi nào thất bại hẳn**, nhưng nó là chi phí thật. Phần lớn retry đến từ
`verifier_entailment` thiếu trường `reason` — đã sửa bằng cách cho trường đó giá trị mặc định.

**⑥ Context caching có chạy:** 11.136/87.789 prompt token của B2 là cache hit (**12,7%**), chứng
minh thứ tự message đang đúng. Tỉ lệ này sẽ tăng mạnh ở arm `SYS` vì 5 judge dùng chung một
system message.

---

## 4. Bug thật do việc chạy thí nghiệm phát hiện

Cả hai đều làm sai lệch chính metric của báo cáo này, và cả hai chỉ lộ ra khi chạy dữ liệu thật.

| # | Bug | Hậu quả nếu không sửa | Đã sửa thế nào |
| --- | --- | --- | --- |
| 1 | Tầng L0 chỉ hỏi **Crossref** để verify DOI | DOI của arXiv (`10.48550/…`) đăng ký ở **DataCite**, Crossref trả 404 ⇒ mọi paper arXiv bị gắn `SOURCE_NOT_FOUND` ⇒ `citation_validity` **âm tính giả hàng loạt** | Hỏi cả Crossref lẫn DataCite; chỉ kết luận "không tồn tại" khi **cả hai** cùng trả lời là không có. Thêm nữa: một nguồn đã có `external_id` từ provider thật thì DOI tra không ra **chỉ hạ độ tin cậy** (cờ `DOI_UNVERIFIED`), không kết luận là bịa — đúng như `SYSTEM_DESIGN_ANALYSIS` §3.4 chốt |
| 2 | OpenAlex gọi bằng `search=` với cụm từ khoá dài | Khớp lỏng kiểu OR ⇒ trả về Landsat-8 và điện mặt trời mái nhà cho một truy vấn về RAG pháp luật ⇒ kho nguồn nhiễu ⇒ bảng related work và mọi metric citation nhiễu theo | Đổi sang `filter=title_and_abstract.search:` + `sort=relevance_score:desc`, cộng một chốt chặn quan hệ **bằng rule, 0 token** (đòi ≥ 2 từ khoá xuất hiện trong title/abstract) |

---

## 5. Limitation — ghi ra trước khi bị hỏi

1. **Cỡ mẫu n = 1, và mới 2/4 arm.** Mọi con số ở §3 là *chỉ dấu*, chưa phải kết luận thống kê.
   `±0.000` trong bảng chỉ là hệ quả của n = 1, **không** phải phương sai thấp.
2. **Chưa chạy `SYS` và `SYS_NO_VERIFY`**, nên hai câu hỏi trung tâm — *vòng judge đóng góp gì* và
   *citation verifier đóng góp gì* — **chưa có số trả lời**. Đây là khoảng trống lớn nhất của báo cáo.
3. **Chưa có human validation 20 cặp** (§7.5 của đề). Cho tới khi có, mọi nhãn của verifier vẫn ở
   mức *"máy nói vậy"* chứ chưa phải *"đã validate"*.
4. **Ngưỡng verifier chưa hiệu chỉnh.** `τ_low = 0.35`, `τ_high = 0.72`, `conf_min = 0.70` là **ước
   đoán, không phải số đo**; grid 3×3 phải chạy trên 20 cặp human-label. Số ở ⑤ trên cho thấy
   `τ_high` gần như chắc chắn phải hạ.
5. **Auditor không đổi được nhà cung cấp.** MVP chỉ có DeepSeek (STACK §2.1), nên không thoả được
   khuyến nghị của đề (§7.3①). Bù bằng bốn lớp: khác tier + `reasoning_effort: max` · prompt viết
   độc lập · chấm blind có xáo thứ tự · human validation. **Tín hiệu còn sót và không che được:
   độ dài văn bản** — B1 ngắn hơn hẳn nên auditor có thể đoán ra.
6. **Không tái lập được hoàn toàn.** DeepSeek **không có tham số `seed`**; thứ tái lập được là
   `temperature: 0` + prompt cố định + `prompt_hash` ghi lại. Đề §7.3③ đòi "cùng seed" —
   điều kiện này **không thoả được đầy đủ** với provider hiện tại.
7. **Scripted user luôn chọn phương án được gợi ý**, nên kết quả là **cận trên** của những gì đạt
   được khi người dùng hợp tác hoàn toàn; người thật có thể chọn tệ hơn.
8. **`agreement_count` là cận dưới của đồng thuận thật.** Gộp issue bằng rule deterministic (để
   chạy lại ra đúng số cũ) sẽ bỏ sót những cặp diễn đạt khác nhau hoàn toàn.
9. **Verifier chạy chế độ *đo* cho cả B1/B2.** Có thể bị hỏi *"baseline được hưởng lợi từ hệ thống
   của bạn à?"*. Trả lời: đó là **thước đo**, không phải hành vi — nó không đổi output của baseline,
   chỉ gắn nhãn lên output đã có. Không đo bằng cùng một thước thì không có bảng so sánh nào cả.

---

## 6. Việc còn lại để báo cáo này hoàn chỉnh

| # | Việc | Vì sao cần |
| --- | --- | --- |
| 1 | Chạy `npm run eval:run -- --arms=B1,B2,SYS,SYS_NO_VERIFY --limit=10` (~2 giờ, ~7,8 triệu token) | Có bảng 4 arm × 10 ý tưởng, mean ± std thật |
| 2 | `npm run eval:audit` trên batch đó | Điểm blind của auditor cho cả 4 arm |
| 3 | Gán nhãn tay 20 cặp (claim, nguồn) → bảng `HumanCheck` | Biến metric tự động thành *có validate*; tính accuracy + Cohen's κ |
| 4 | Grid search `τ_low × τ_high` trên đúng 20 cặp đó | Biến ngưỡng từ *"số tôi chọn"* thành *"số tôi đo"* |
| 5 | Một biểu đồ cột cho 4 metric chính | Đề §7.4 yêu cầu |
| 6 | Xử lý phát hiện ③ ở §3 | `unsupported_rate` hiện không so sánh được trực tiếp giữa B1 và B2 |

Toàn bộ hạ tầng cho 6 việc trên **đã chạy được**; việc còn lại là thời gian máy và một buổi gán
nhãn tay.
