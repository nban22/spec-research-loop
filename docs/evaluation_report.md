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

---

# PHỤ LỤC A — Làn A · Bằng chứng & Nguồn

> Mục này do làn A (issues #1–#6) viết, nối vào báo cáo chính ở trên. Ba mục con: cải tiến là gì,
> đo bằng cách nào, và **những chỗ không cải thiện** — mục cuối là mục quan trọng nhất.

## A.1 Bốn cơ chế được thêm

| # | Cơ chế | Cờ bật/tắt | Chi phí LLM |
| --- | --- | --- | --- |
| #1 | Chấm độ tin cậy của nguồn, quy về ba mức kèm câu giải thích | `source_credibility` | **0 token** |
| #2 | Verifier leo thang xuống **toàn văn arXiv** khi abstract không kết luận nổi | `evidence_fulltext` | ngang hiện tại |
| #3 | Phát hiện **hai nguồn nói ngược nhau** → gán `CardStatus.CONFLICT` | `conflict_detector` | 0 ở đường thường |
| #4 | Hiệu chỉnh ngưỡng verifier bằng nhãn người, qua `eval/calibrate.ts` | — (công cụ đo) | 0 token |

Ba cờ đều **mặc định tắt** và chính là cần gạt của ablation ở §A.3.

**#3 là chức năng bắt buộc theo §5 của đề, không phải tính năng thêm.** Trước làn A, giá trị
`CONFLICT` có trong enum `CardStatus`, có màu trong `status-style.ts`, có nhắc trong
`prompts/generator.md`, và cột `Card.conflict_with_card_id` có trong `schema.prisma` — nhưng
**không một dòng backend nào gán chúng**. Bị hỏi "conflict phát hiện thế nào" thì không có câu trả
lời nào ngoài "LLM tình cờ dán nhãn ở bước 1".

## A.2 Vì sao chi phí LLM không tăng khi đọc toàn văn

Đây là câu hay bị hỏi nhất, nên nói trước: **đọc toàn văn không làm tăng token API**.

Tầng L3b lấy 5 đoạn gần khẳng định nhất, mỗi đoạn 3 câu ≈ 400 ký tự ⇒ khoảng 2000 ký tự gửi lên
mô hình — **đúng bằng một abstract**. Phần đắt thêm là embedding, mà embedding chạy trên CPU bằng
`all-MiniLM-L6-v2` cục bộ, 0 token API. Toàn văn được cache theo **nguồn** (`SourceFullText`, cache
cả lần thất bại) chứ không theo cặp, và có trần cứng 8 nguồn mỗi lần chạy.

Đo trên dự án demo (7 cặp, sau khi làm nóng model và cache): tắt cờ 35,3s · bật cờ 28,2s. Con số
này **bị nhiễu nặng** bởi độ trễ API DeepSeek — riêng nó đã dao động 17–53s giữa các lượt giống
hệt nhau. Kết luận trung thực: toàn văn **không thêm thời gian đo được**, chứ không phải nó nhanh
hơn. Mốc "không quá 2×" của #2 đạt được, nhưng phần lớn là vì **độ phủ thấp** (xem A.4), không
phải vì toàn văn rẻ.

## A.3 Ablation ba cấu hình

Batch `a0000000-…-00000000000a` · 2 ý tưởng (I01, I02) × 3 cấu hình · 2026-09-01 ·
kết quả thô ở `backend/eval/results/a0000000-0000-4000-8000-00000000000a-evidence.json`.

| cấu hình | n | unsupported_rate | fabrication_rate | l4_llm_ratio | fulltext_hit_rate | conflict_detected | low_credibility_claim_rate | evidence_precision_human |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| abstract (như MVP) | 2 | 0,800 | 0,000 | 0,944 | 0,000 | 0,0 | 0,000 | — |
| abstract + chấm tin cậy | 2 | 1,000 | 0,000 | 1,000 | 0,000 | 0,0 | 0,000 | — |
| toàn văn đầy đủ | 2 | 0,962 | 0,000 | 1,000 | 0,000 | 0,0 | 0,000 | — |

**Bảng này gần như không nói được gì, và dưới đây là lý do — đọc phần này chứ đừng đọc bảng.**

**① `fulltext_hit_rate = 0` vì hai dự án của nhánh toàn văn không có lấy một nguồn arXiv nào.**
Đếm cụ thể: I01 có 10 nguồn, **0** là arXiv; I02 có 23 nguồn, **0** là arXiv. Tầng L3b vẫn leo
thang đúng 14 lần (4 + 10) và cả 14 lần đều dừng ở `NOT_ARXIV` — tức cơ chế chạy đúng, chỉ là
không có gì để đọc. Trên toàn bộ 115 nguồn của cả 6 lượt thì có 10 nguồn arXiv (**8,7%**), nhưng
chúng rơi vào bốn dự án của hai nhánh còn lại, nơi cờ đang tắt nên không thử lần nào.

Đã kiểm riêng để chắc đây **không** phải lỗi nhận diện: `detectArxivId` bắt được đúng 10/10 nguồn
có dấu vết arXiv trong `raw`, không sót cái nào.

**② Chênh lệch `unsupported_rate` giữa ba dòng là nhiễu, không phải tín hiệu.** Đây là **khiếm
khuyết thiết kế của chính script ablation này**, phải nói ra: mỗi nhánh tự chạy lại generator nên
**ba nhánh không dùng chung một tập khẳng định**. Ba cờ của làn A về nguyên tắc chỉ đổi được
`unsupported_rate` qua đường toàn văn, mà đường đó không chạy lần nào (xem ①) — nên 0,800 / 1,000
/ 0,962 chỉ là dao động của LLM giữa các lượt sinh thẻ. Muốn so đúng thì ba nhánh phải verify lại
trên **cùng một** `SpecVersion`, và đó là việc sửa cho lượt chạy sau.

**③ `conflict_detected = 0` là hệ quả trực tiếp của `unsupported_rate` ≈ 1.** Tín hiệu cực chỉ
kích hoạt khi có **một nguồn hỗ trợ và một nguồn phản bác** trên cùng một thẻ. Khi gần như mọi cặp
đều `UNSUPPORTED` thì không tồn tại cặp PRO–CON nào — và theo đúng thiết kế, "mọi nguồn cùng phản
bác" **không** phải mâu thuẫn, chúng đồng ý với nhau. Cơ chế đã được kiểm là chạy đúng trên dữ liệu
dựng sẵn (`seed-evidence-demo.ts`): 3 thẻ `CONFLICT`, 2 có `conflict_with_card_id`, 0 token.

**④ `low_credibility_claim_rate = 0`** — không thẻ nào bị chống lưng **hoàn toàn** bằng nguồn mức
thấp. Với n = 2 thì đây là số thật nhưng chưa nói được gì.

**⑤ `evidence_precision_human = —`** vì bảng `HumanCheck` đang trống. Xem §A.4 ②.

**Kết luận trung thực:** ở cỡ mẫu này, ablation **không đủ sức đo** ba cơ chế của làn A. Bằng chứng
rằng chúng chạy đúng đến từ dự án demo dựng sẵn và từ lượt đo trên "Attention Is All You Need"
(§A.2), không đến từ bảng trên. Việc còn lại là thời gian máy: chạy đủ 10 ý tưởng (~3 giờ) và sửa
khiếm khuyết ② để ba nhánh dùng chung một tập khẳng định.

### A.3.1 Vì sao `unsupported_rate` ≈ 1 — nguyên nhân thật, tìm ra sau khi chạy full flow

Ba nhận xét ② và ③ ở trên nói đúng *hiện tượng* nhưng chưa chạm *nguyên nhân*. Một lượt chạy toàn
bộ luồng sinh spec trên API thật đã chỉ ra nó, và nó là **lỗi ngữ nghĩa của verifier**, không phải
nhiễu của LLM.

Thống kê trên **toàn bộ** cặp thẻ–nguồn đã kiểm chứng trong cơ sở dữ liệu, mọi dự án, mọi lượt chạy:

| loại thẻ | n | SUPPORTED | WEAK | UNSUPPORTED |
| --- | ---: | ---: | ---: | ---: |
| `GAP` | 315 | **0 (0%)** | 15 | 300 |
| `CONTRIBUTION` | 130 | **0 (0%)** | 16 | 114 |
| `CLAIM` | 67 | 4 (6%) | 0 | 63 |

**0/315 và 0/130 không phải xác suất thấp — đó là điều không thể xảy ra.** Lý do nằm ở chỗ
`VERIFIABLE_CARD_TYPES` cho cả bốn loại thẻ đi qua tầng L4, trong khi phép thử của L4 là *kéo theo*:

- **`GAP` khẳng định một sự vắng mặt** — *"No retrieved work evaluates a cross-encoder reranker on
  Vietnamese legal statute passages"*. Không tóm tắt đơn lẻ nào kéo theo được một phủ định phổ
  quát. Câu hỏi đúng cho trích dẫn của một gap là *"nguồn này có thuộc mảng mà gap nói tới không"* —
  độ liên quan, không phải kéo theo.
- **`CONTRIBUTION` khẳng định việc tác giả sắp làm** — *"We define a paired evaluation that…"*. Một
  bài báo cũ mà kéo theo được nó thì nghĩa là đóng góp **không mới**; tức `ENTAILS` đáng ra là tín
  hiệu **xấu**, ngược hẳn cách bảng quyết định L5 đang dùng.

Vì 445/512 cặp thuộc hai loại đó, `unsupported_rate` bị đẩy về 1 bất kể ba cờ của làn A bật hay
tắt — nhận xét ② nói "nhiễu giữa các lượt sinh thẻ" là **chưa đủ**: phần lớn chênh lệch bị nén
xuống bởi một trần cứng. Và ③ là hệ quả dây chuyền: mọi cặp cùng `UNSUPPORTED` thì không tồn tại
cặp PRO–CON, nên `conflict_detected` không thể khác 0.

**Đã sửa:** thêm `ENTAILMENT_CARD_TYPES = ['CLAIM', 'EVIDENCE']`. Mọi loại thẻ **vẫn** qua L0–L2
(nguồn có thật · DOI tra được · con số trong thẻ có mặt trong nguồn) — tuyến chống bịa trích dẫn
không mất; chỉ L3–L4 mới giới hạn theo loại thẻ. Cặp dừng sau L2 nhận nhãn `WEAK` kèm cờ
`CITATION_ONLY` để không lẫn với "đã hỏi mô hình và bằng chứng yếu". Cổng xuất bản tự sửa theo:
nó lọc `support_label = 'UNSUPPORTED'`, nên thôi chặn vì những cặp không bao giờ thắng được, nhưng
vẫn chặn khi nguồn của một `GAP` không tra ra (L0 chạy trước, mọi loại thẻ).

Hệ quả về chi phí phải đo lại ở lượt ablation sau: 445/512 cặp không còn gọi L4, nên `l4_llm_ratio`
và tổng token sẽ giảm mạnh — con số 0,944–1,000 ở bảng A.3 là của **phiên bản trước** khi sửa.

## A.4 Những chỗ **không** cải thiện — đọc kỹ mục này

**① `fulltext_hit_rate` thấp, và đó là giới hạn của thiết kế, không phải lỗi.**
Chỉ arXiv mới có bản HTML mở đọc được: `arxiv.org/html/` chỉ tồn tại với bài nộp bằng LaTeX từ
12/2023 trở đi, ar5iv phủ kho cũ nhưng snapshot trễ hàng tháng, còn nguồn ACM/IEEE/Springer/
Elsevier thì **0%**. Đường PDF bị cắt khỏi phạm vi có chủ ý: text bóc từ PDF bẩn tới mức câu chứng
cứ không còn khớp **nguyên văn** với nguồn, mà khớp nguyên văn chính là thứ tầng chống bịa trích
dẫn (L4b) đang bảo vệ — nới nó ra thì mất luôn cơ chế đáng giá nhất để đổi lấy vài phần trăm phủ.

Cách đọc đúng con số này: *"toàn văn phủ được x% số nguồn; trong nhóm đó nhãn đổi như sau"* —
**không** phải *"verifier đọc toàn văn"*.

**② `evidence_precision_human` chưa có số.**
Bảng `HumanCheck` cần **ít nhất 30 cặp gán tay, chấm mù**. Toàn bộ đường ống đã dựng xong và chạy
được — màn hình gán nhãn ở `/projects/<id>/label`, và `eval/calibrate.ts` quét lưới 27 bộ ngưỡng —
nhưng việc ngồi gán 30 cặp là **việc tay không code thay được**. Chừng nào chưa gán thì ngưỡng
0,35 / 0,72 / 0,7 vẫn đúng như `thresholds.ts` tự thú: *"ước đoán, không phải số đo"*.

Đã kiểm chứng đường ống bằng một lượt smoke test 7 cặp rồi xoá: `replayLabel` cho **đúng** nhãn mà
verifier thật đã gán trên cả 7 cặp, và cột "không tái lập" nhảy từ 0 lên 2 khi đẩy `τ_high` lên
0,76 — nghĩa là phép suy và phần báo cáo giới hạn của nó đều chạy đúng.

**③ `conflict_detected` có baseline bằng 0 theo nghĩa đen.**
Không phải "cơ chế cũ bắt được 0 cặp", mà là **chưa từng có cơ chế nào**. Nên mọi con số dương ở
đây đều là cải thiện tuyệt đối, và cũng vì thế nó **không chứng minh được độ chính xác** — muốn
biết bắt đúng hay bắt bừa thì phải kiểm tay từng cặp. Tầng luật được thiết kế thiên về **bỏ sót
hơn là báo nhầm**: tín hiệu số học bắt buộc hai câu phải cùng tên metric, tín hiệu chiều bắt buộc
hai câu phải cùng chủ đề (jaccard ≥ 0,25) và phải chuẩn hoá phủ định trước khi so cực. Chỉ tín
hiệu **cực** (một nguồn được chấm hỗ trợ, nguồn kia bị chấm phản bác) mới đủ chắc để tự kết luận;
hai tín hiệu còn lại chỉ **đề cử** cặp cho tầng LLM.

**④ Ablation chạy trên cỡ mẫu nhỏ.** Xem `n` ở bảng §A.3. Cùng một limitation với báo cáo chính:
hạ tầng chạy được, thứ còn thiếu là thời gian máy.

## A.5 Chỗ lệch có chủ ý so với câu chữ của issue

| Issue | Câu chữ | Đã làm | Vì sao |
| --- | --- | --- | --- |
| #6 | Ghi kết quả vào `EvalRun`, chống trùng bằng `UNIQUE(batch_id, arm, idea_id)` | Ghi ra `eval/results/<batch>-evidence.json`, chống trùng bằng chính file đó | `enum Arm` chỉ có `B1 B2 SYS SYS_NO_VERIFY`, luật chung 2 cấm thêm giá trị ⇒ ba cấu hình của làn A không có tên arm hợp lệ |
| #5 | Thêm mục điều hướng vào `top-nav.tsx` | Đăng ký ở `command-palette.tsx` | `NAV` chỉ chứa link toàn cục, không mang được `projectId`. Cả 4 màn per-project của làn C đã theo lối này |
| #3 | Ghi `Card.conflict_with_card_id` | Chỉ ghi ở phạm vi `CROSS_CARD` | Xung đột giữa hai nguồn của **cùng một thẻ** thì không có "thẻ đối diện" để trỏ; tự trỏ về chính nó là vô nghĩa và không truy vấn được |
| #2 | "cờ chẩn đoán" khi không lấy được toàn văn | Thêm 2 giá trị vào `verifierFlagSchema` | Ngoại lệ có ý thức với luật chung 2 — đây là zod enum lưu xuống cột `Json`, không phải enum Prisma, nên không migration và không rủi ro chéo làn |
