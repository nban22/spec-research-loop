# SpecResearch Loop — Kim chỉ nam đồ án

> Tài liệu phân tích yêu cầu + kế hoạch triển khai, tổng hợp từ `SPECRESEARCH_LOOP.docx` (bao gồm cả 5 ảnh mockup nhúng trong file).
> Mục tiêu: đủ điều kiện đạt điểm tối đa, không tối ưu thừa.

---

## 0. Cảnh báo trước khi bắt đầu

**File đề bài thiếu mục 7.** Đánh số nhảy từ *"6. Sản phẩm bàn giao"* sang thẳng *"8. Tinh thần sáng tạo"*. File cũng không có bảng rubric chấm điểm và không có mục non-functional requirements. Nhiều khả năng mục 7 chính là phần tiêu chí chấm điểm bị mất khi export.

→ **Mọi kết luận về "đủ 10 điểm" trong tài liệu này là suy luận** từ (a) danh sách 16 chức năng bắt buộc, (b) danh sách 10 sản phẩm bàn giao, (c) đoạn *"Sinh viên được đánh giá cao khi…"*. Không phải trích rubric.

**Ba câu cần hỏi giảng viên ngay:**
1. Mục 7 bị thiếu là gì? (nhiều khả năng là rubric)
2. Video demo: độ dài, format, có cần voice-over / có cần quay mặt không?
3. Xác nhận cách hiểu "ít nhất hai baseline" — xem §6, nó quyết định ~20–25% thời lượng dự án.

---

## 1. Output cuối cùng

**Một WEBSITE.** Đề lặp lại 4 lần: *"Sinh viên xây dựng một website"*, *"Website phải giúp người dùng"*, *"Website cần có"*, *"Website chạy được"*. Không phải CLI tool, không phải desktop app, không phải mobile app.

5 ảnh mockup xác nhận đây là web app dạng **wizard nhiều bước**:
- Top nav: Trang chủ / Dự án / Lịch sử phiên bản / Trợ giúp + user account góc phải
- Thanh stepper: 1. Nhập ý tưởng → 2. Làm rõ → 3. Nghiên cứu → 4. Judge → 5. Spec cuối
- Layout 3 cột, mỗi bước có box "Tóm tắt sau vòng N" ở dưới cùng
- Ảnh 4 có panel 5 Judge nằm ngang, bảng "Tổng hợp issue" gắn nhãn CRITICAL / MAJOR / MINOR + trace về Judge nào (J1, J3, J4…)
- Ảnh 5 có nút **Xuất PDF** và **Xuất Markdown**

Đề ghi rõ *"sinh viên không cần làm theo y chang như vậy"* — mockup là gợi ý, không phải spec UI bắt buộc.

**Ràng buộc kỹ thuật: không có.** Đề không chỉ định framework, ngôn ngữ, database, hosting. Tự do chọn.

**Sản phẩm mà user nhận được khi dùng web:** nhập 1 ý tưởng nghiên cứu mơ hồ → nhận về **một bản Research Specification 14 mục**, đã qua 5 Judge phản biện và được chính user xác nhận, export ra PDF/Markdown:

| # | Mục của spec | # | Mục của spec |
|---|---|---|---|
| 1 | Problem statement | 8 | Experimental protocol |
| 2 | Research questions | 9 | Baselines và metrics |
| 3 | Related-work matrix | 10 | Ablation plan |
| 4 | Research gap | 11 | Compute budget |
| 5 | Proposed approach | 12 | Risks và limitations |
| 6 | Expected contributions | 13 | Open issues |
| 7 | Claim–evidence matrix | 14 | Decision history |

> Lưu ý: mục 9 "Baselines và metrics" ở đây là **nội dung spec sinh ra cho user**, khác hoàn toàn với deliverable #7 "ít nhất hai baseline" mà bạn phải nộp. Xem §6.

---

## 2. Sản phẩm bàn giao (mục 6 của đề)

| # | Hạng mục | Diễn giải | Công sức |
|---|---|---|---|
| 1 | Website chạy được | Deploy hoặc chạy local được, có README setup | — |
| 2 | Source code | Repo Git, commit history sạch | — |
| 3 | Tài liệu kiến trúc | Sơ đồ component + data flow + data model | 3–4h |
| 4 | Dataset / tập use case thử nghiệm | ~10 ý tưởng nghiên cứu mơ hồ để test — xem §7 | 1h |
| 5 | **Prompt của Generator và các Judge** | Nộp prompt gốc dạng file. Tách ra `prompts/` **ngay từ ngày 1**, đừng hardcode trong code | — |
| 6 | Cơ chế kiểm tra citation / evidence | Module verifier, phải mô tả được thuật toán | 4–6h |
| 7 | ⚠️ **Ít nhất hai baseline** | **Xem §6 — đây là cạm bẫy lớn nhất** | 2–3h |
| 8 | ⚠️ **Báo cáo đánh giá hệ thống** | Bảng số + biểu đồ so 3 arm — xem §7 | 1 ngày |
| 9 | **Video demo** | Bắt buộc. Đề không nói gì về độ dài/format → hỏi giảng viên | 2–3h |
| 10 | Một research spec hoàn chỉnh do hệ thống tạo ra | Sample output đẹp nhất, xuất PDF | — |

**Điểm mấu chốt:** deliverable #4 + #7 + #8 đứng liền nhau vì chúng là **ba mảnh của cùng một thí nghiệm** (tập test + các arm đối chứng + báo cáo kết quả). Đây là đồ án kiểu research, không phải CRUD app. Câu chốt cuối đề nhấn lại:

> *"Cải tiến này giải quyết vấn đề gì, được kiểm nghiệm như thế nào và kết quả có tốt hơn baseline hay không?"*

---

## 3. Chức năng bắt buộc — 16 mục

Checklist sống còn, thiếu cái nào mất điểm cái đó:

- [ ] 1. Nhập ý tưởng nghiên cứu
- [ ] 2. Diễn giải lại ý tưởng (paraphrase để user confirm hệ thống hiểu đúng)
- [ ] 3. Phân rã problem / gap / claim / contribution / evidence
- [ ] 4. Tìm kiếm và quản lý nguồn
- [ ] 5. Tạo bảng related work
- [ ] 6. Phát hiện ambiguity và conflict
- [ ] 7. Tạo lựa chọn có giải thích, ví dụ, **và option "Other"**
- [ ] 8. Lưu quyết định người dùng
- [ ] 9. Sinh kế hoạch thí nghiệm
- [ ] 10. Ước lượng tài nguyên
- [ ] 11. Tạo research spec
- [ ] 12. **Chạy nhiều Judge độc lập**
- [ ] 13. Tổng hợp điểm đồng thuận và bất đồng
- [ ] 14. Cho người dùng quyết định sửa đổi
- [ ] 15. **Quản lý version và hiển thị diff**
- [ ] 16. Xuất bản spec cuối cùng

### Chi tiết bị chôn trong 10 bước quy trình (16 gạch đầu dòng trên không nói hết)

**Bước 2 — 8 loại thẻ, 6 trạng thái.**
Loại thẻ: `Problem`, `Research question`, `Gap candidate`, `Contribution`, `Claim`, `Evidence`, `Constraint`, `Open question`.
Trạng thái: `CONFIRMED` / `PROPOSED` / `MISSING` / `AMBIGUOUS` / `UNSUPPORTED` / `CONFLICT`.
→ Đây là **schema trung tâm của toàn hệ thống**. Thiết kế data model quanh nó, đừng để mỗi bước một cấu trúc riêng.

**Bước 3 — mọi nhận định phải link nguồn cụ thể.** Bảng related work có 4 cột: Nghiên cứu / Đã làm gì / Feedback sử dụng / Điểm cần nghiên cứu thêm. Ảnh 2 thêm cột thứ 5 là icon link tới nguồn.

**Bước 4 — cấm sinh gap kiểu lười.** Đề nói thẳng: gap **không được** tạo theo kiểu *"tôi chưa thấy paper giống hệt nên đây là gap"*. Mỗi gap phải trả lời 4 câu:
1. Nghiên cứu trước đã làm được gì?
2. Điểm nào vẫn còn hạn chế?
3. Vì sao hạn chế đó quan trọng?
4. Có thể kiểm nghiệm bằng thí nghiệm nào?

**Bước 5 — Claim–Evidence Card có 5 trường bắt buộc:** Claim / Baseline / Metric / Evidence / **Điều kiện bác bỏ**. Trường cuối hay bị quên.

**Bước 7 — module ước lượng tài nguyên** phải ra được: model, VRAM, số candidate, số vòng, số mẫu đánh giá, token/API cost, thời gian. Và **đề xuất giảm quy mô nếu vượt RTX 3090**.

**Bước 9 — 5 Judge cụ thể, có tên:**

| Judge | Nhiệm vụ |
|---|---|
| J1 — Research Gap Judge | Gap có thật sự được tài liệu hỗ trợ không |
| J2 — Contribution Judge | Contribution có mới, rõ, có bị phóng đại không |
| J3 — Experiment Judge | Thí nghiệm có đủ chứng minh claim không |
| J4 — Evidence Judge | Citation có thật sự hỗ trợ nội dung đi kèm không |
| J5 — Conference Readiness Judge | Originality / significance / soundness / clarity / reproducibility |

**Ràng buộc kiến trúc (không phải gợi ý):** *"Các Judge phải đánh giá riêng trước khi xem nhận xét của nhau."* → 5 lời gọi LLM với context sạch, chạy song song, không truyền output của nhau.

Mỗi issue phải có **mức độ** (CRITICAL / MAJOR / MINOR) và **trace về Judge nào phát hiện**. Format nhận xét theo đề: `Vấn đề` / `Lý do` / `Mức độ` / `Đề xuất`.

**Bước 10 — vòng lặp, không phải one-shot:**
```
Judge ra issue → hệ thống đưa lựa chọn (A/B/C/Other)
  → user chọn → sửa spec → hiển thị diff
  → chạy lại verifier liên quan → Judge kiểm tra lại
  → user xác nhận bản cuối
```

### Để chạm 10 điểm

Đoạn *"được đánh giá cao"* yêu cầu **đề xuất một cơ chế mới + chứng minh bằng số liệu** rằng nó giúp ít nhất một trong:

- Giảm claim không có bằng chứng ↓
- Phát hiện gap tốt hơn ↑
- Giảm số câu hỏi không cần thiết ↓
- Giảm bias của Judge ↓
- Tạo experiment plan đầy đủ hơn ↑
- Giảm thời gian hoặc chi phí hoàn thiện spec ↓

**Chọn đúng 1 cơ chế**, đo trước/sau, có bảng số. Đừng làm 3 cái nửa vời.

**Gợi ý rẻ nhất mà hiệu quả nhất — Citation Verifier rule-based:** với mỗi claim có trích nguồn, kiểm tra abstract của nguồn đó có thật sự support claim không (embedding similarity + LLM entailment check), gắn nhãn `SUPPORTED / WEAK / UNSUPPORTED`, chặn không cho spec chứa citation `UNSUPPORTED`. Rồi đo tỉ lệ citation sai giảm bao nhiêu %. Vừa là cơ chế mới (điểm cộng), vừa là deliverable #6 (bắt buộc), vừa cho metric đẹp nhất trong báo cáo. **Một mũi tên ba đích.**

**Gợi ý #2 — Judge disagreement score:** đo độ bất đồng giữa 5 Judge, dùng nó làm tín hiệu "chỗ nào của spec đáng ngờ nhất" và ưu tiên hỏi user ở đúng chỗ đó. Ăn đúng hai gạch "giảm bias của Judge" + "giảm số câu hỏi không cần thiết".

### Optional (điểm cộng, không bắt buộc)

Các mục "Khuyến khích sáng tạo": concept map, citation graph, timeline nghiên cứu, similarity map, drag-drop claim↔evidence, màu theo trạng thái thẻ, Pareto frontier chất lượng/chi phí, GPU estimator, cost simulator, early stopping, behavioral clustering, active candidate selection.

→ Làm **sau khi** 16 chức năng + báo cáo đánh giá đã xong. Nếu thiếu thời gian, bỏ hết cũng được.

---

## 4. Non-functional requirements

**Đề không có mục NFR riêng.** Nhưng có NFR bị chôn rải rác — đây mới là những cái thực sự bị chấm:

| NFR | Nguồn trong đề | Cách thể hiện |
|---|---|---|
| **Traceability** | Bước 3: *"Mỗi nhận định phải liên kết với nguồn cụ thể"* | Mọi claim/related-work row có `source_id` trỏ tới record nguồn thật |
| **Judge independence** | Bước 9 | 5 API call context sạch, chạy song song, log riêng |
| **Versioning + diff** | Chức năng 15 + nav "Lịch sử phiên bản" | Mỗi lần sửa tạo version mới, render diff |
| **Auditability** | Chức năng 8 + mục 14 spec ("Decision history") | Log mọi lựa chọn: timestamp, câu hỏi, option chọn, lý do |
| **Human-in-the-loop** | Xuyên suốt + ảnh 4: *"người dùng vẫn là người quyết định cuối cùng"* | Không bước nào tự động chốt |
| **Grounding / anti-hallucination** | Bước 3 + deliverable #6 | Chỉ dùng paper lấy từ API thật; cảnh báo nguồn quá cũ hoặc không hỗ trợ claim |
| **Reproducibility** | J5 chấm tiêu chí này | Seed cố định, temperature=0, log đủ để chạy lại |
| **Export** | Ảnh 5 | PDF + Markdown |

**Cẩn thận với nhóm metric kỹ thuật** (JSON validity, latency, token cost, unsupported claim rate, claim precision/recall, contradiction rate): chúng xuất hiện ở Bước 6, tức là **nội dung spec mà hệ thống sinh ra cho user**, không phải NFR của website bạn. Nhưng tái sử dụng chúng làm metric cho §7 là hoàn toàn hợp lý và ăn điểm.

**Không có yêu cầu về:** concurrent users, response-time SLA, security/auth nâng cao, accessibility, mobile responsive, uptime, i18n. **Đừng tốn thời gian vào những thứ này.**

---

## 5. LLM — cloud có được không?

**Được. Đề không có bất kỳ ràng buộc nào.** Không yêu cầu self-host, không cấm API, không chỉ định model. DeepSeek / Anthropic / OpenAI / Gemini đều hợp lệ.

### Hiểu nhầm phổ biến cần tránh

Cụm **"RTX 3090"** và **"VRAM ~20GB"** xuất hiện nhiều lần trong đề — nhưng đó là **nội dung mà website của bạn phải sinh ra cho user**: website ước lượng xem *thí nghiệm trong bản spec của user* có chạy nổi trên RTX 3090 không.

Nó **KHÔNG** có nghĩa website của bạn phải chạy LLM local. Module "Kiểm tra tính khả thi" chỉ là một **calculator ước lượng**:

```
VRAM ≈ params × bytes_per_param(quantization) × overhead_factor
thời gian ≈ candidates × rounds × eval_samples × latency_per_call
token cost ≈ (prompt_tokens + output_tokens) × số lời gọi × đơn giá
```

Công thức + LLM reasoning là đủ. Không cần GPU nào cả.

### Setup tối thiểu đủ điểm

**Generator:** 1 model mạnh (Claude hoặc DeepSeek) cho diễn giải, phân rã, sinh gap, sinh experiment plan. Bắt buộc JSON structured output — spec là dữ liệu có cấu trúc, không phải văn bản tự do.

**Judge:** đề cho phép 3 cách — (a) model khác nhau, (b) *cùng model nhưng context và prompt độc lập*, (c) rule-based + LLM.
- Cách rẻ nhất **vẫn hợp lệ**: cùng 1 model, 5 API call riêng, context sạch, prompt khác nhau.
- Cách nên làm: **trộn 2 nhà cung cấp** (J1, J3, J5 = Claude; J2, J4 = DeepSeek). Vừa rẻ, vừa cho bạn sẵn một "cơ chế mới" để đo và viết vào báo cáo (giảm bias của Judge).

**Search nguồn thật — chỗ dễ mất điểm nhất.** Dùng **Semantic Scholar API** hoặc **arXiv API** (miễn phí, không cần key) để lấy paper thật, rồi mới cho LLM đọc abstract và điền bảng related work. Nếu để LLM tự "nhớ" paper, nó sẽ bịa DOI/tên tác giả, và deliverable #6 + Judge 4 của bạn thành rỗng.

**Prompt management:** tách `prompts/generator.md`, `prompts/judge_gap.md`, … ngay từ đầu (deliverable #5). Version chúng cùng Git.

**Chi phí thực tế ước tính:** ~1 spec đầy đủ ≈ 15–25 lời gọi LLM. Test 10 ý tưởng × 3 arm = 30 lượt ≈ vài USD với DeepSeek, ~10–20 USD với Claude. Không đáng lo.

---

## 6. Giải mã deliverable #7 — "Ít nhất hai baseline"

### Phân tích

Chữ "baseline" xuất hiện trong đề ở **hai ngữ cảnh hoàn toàn khác nhau**:

**Ngữ cảnh A — baseline là nội dung app sinh ra cho user.**
Bước 5 (Claim–Evidence Card: *"Baseline: Human prompt, self-refine, OPRO-style optimizer"*) và Bước 6 (*"Thí nghiệm 1 — So sánh baseline"*). Đây là ví dụ minh họa cho một ý tưởng nghiên cứu cụ thể của user. Là **functional requirement**, không phải thứ đem nộp.

**Ngữ cảnh B — baseline là hệ thống đối chứng cho chính app của bạn.**
Đúng 3 chỗ: mở đầu (*"phải chứng minh hiệu quả bằng dữ liệu, verifier hoặc so sánh với baseline"*), mục 6 deliverable #7, và câu chốt cuối bài (*"kết quả có tốt hơn baseline hay không?"*).

### Kết luận: deliverable #7 là ngữ cảnh B

Bằng chứng quyết định nằm ở **vị trí trong danh sách nộp**:

> #4 Dataset hoặc tập use case thử nghiệm → #7 Ít nhất hai baseline → #8 Báo cáo đánh giá hệ thống

Ba món đứng cạnh nhau vì là ba mảnh của cùng một thí nghiệm. Nếu "hai baseline" chỉ là nội dung sinh ra trong spec thì nó đã nằm trong mục 5 (Chức năng bắt buộc) rồi, không có lý do liệt kê lại ở mục nộp.

**→ Không phải "tìm 2 samples". Là 2 hệ thống/pipeline đơn giản hơn, cùng nhận input giống hệt app của bạn, rồi so output bằng metric.**

### Cách làm rẻ nhất — 3 arm bậc thang

| Arm | Là gì | Công sức |
|---|---|---|
| **B1 — Single-shot LLM** | 1 prompt duy nhất: *"cho ý tưởng này, viết research spec 14 mục"* → xong. Không search, không phân rã, không Judge | ~30 dòng code |
| **B2 — Pipeline no-Judge** | App của bạn nhưng **tắt vòng Judge**: có retrieval + phân rã + experiment plan, dừng ngay sau khi ra spec tạm thời | 1 feature flag |
| **SYS — Full system** | App đầy đủ: 5 Judge + vòng sửa + user confirm | đã có |

**Vì sao cấu trúc bậc thang này đẹp:** nó cho bạn câu chuyện sẵn trong báo cáo —
- **B1 → B2** đo đóng góp của *retrieval + phân rã có cấu trúc*
- **B2 → SYS** đo đóng góp của *vòng Judge*

Đây chính là câu trả lời trực tiếp cho *"cải tiến của bạn giải quyết vấn đề gì, tốt hơn baseline chỗ nào"*.

---

## 7. Kế hoạch đánh giá hệ thống (deliverable #4 + #8)

### 7.1 Tập test — `eval/ideas.json`

10 ý tưởng mơ hồ, mỗi cái 1–2 câu, trải trên vài domain. Ít hơn 8 thì bảng số trông mỏng.

```json
[
  {"id": "I01", "domain": "SE",       "text": "Tôi muốn dùng LLM để tự động phát hiện lỗi logic trong code review."},
  {"id": "I02", "domain": "Medical",  "text": "Tôi muốn làm hệ thống gợi ý phác đồ điều trị từ hồ sơ bệnh án."},
  {"id": "I03", "domain": "Transport","text": "Tôi muốn dùng graph neural network để dự đoán ùn tắc giao thông ở TP.HCM."},
  {"id": "I04", "domain": "NLP",      "text": "Tôi muốn cải thiện RAG cho tài liệu pháp luật tiếng Việt."},
  {"id": "I05", "domain": "Systems",  "text": "Tôi muốn giảm chi phí inference của LLM bằng cách chọn model động."},
  {"id": "I06", "domain": "CV",       "text": "Tôi muốn phát hiện sản phẩm lỗi trên dây chuyền bằng ảnh."},
  {"id": "I07", "domain": "Security", "text": "Tôi muốn dùng LLM để phát hiện email lừa đảo tiếng Việt."},
  {"id": "I08", "domain": "Edu",      "text": "Tôi muốn tự động chấm bài luận của học sinh cấp 3."},
  {"id": "I09", "domain": "Finance",  "text": "Tôi muốn dự báo rủi ro tín dụng từ dữ liệu giao dịch."},
  {"id": "I10", "domain": "HCI",      "text": "Tôi muốn đo mức độ tin tưởng của người dùng vào gợi ý của AI."}
]
```

### 7.2 Metric — chọn đúng 4 cái

| Metric | Cách đo | Vì sao chọn |
|---|---|---|
| **Citation validity (%)** | Lấy title mỗi paper được trích → query Semantic Scholar API → có match không | **Deterministic, 0 LLM, dễ nhất.** B1 bịa paper tơi tả (thường 30–60% sai), SYS dùng API thật nên ~100%. Delta to và không cãi được |
| **Unsupported claim rate (%)** | Tách spec thành các claim có trích nguồn → LLM check (claim, abstract) có entail không | Đúng trọng tâm đề bài |
| **Spec completeness (0–14)** | Rule-based: đếm mục nào có mặt và không rỗng | Viết 20 phút |
| **Số issue MAJOR + CRITICAL** | Chạy **1 auditor riêng** trên cả 3 output | Đo chất lượng tổng thể |

Phụ: token/spec, thời gian/spec (đề có nhắc "giảm thời gian hoặc chi phí" trong danh sách được đánh giá cao).

### 7.3 Ba chi tiết kỹ thuật quyết định điểm

**① Auditor phải độc lập với 5 Judge trong app.**
Nếu lấy chính Judge của mình đi chấm output của chính mình → kết quả vô giá trị, giám khảo sẽ hỏi ngay. Dùng model nhà cung cấp khác (5 Judge = Claude → auditor = DeepSeek), và **giấu nhãn arm + xáo thứ tự** khi đưa cho auditor chấm.

**② Phải có "scripted user".**
App là human-in-the-loop, mà thí nghiệm cần lặp lại được. Giải pháp: chế độ auto **luôn chọn phương án A** (hoặc option hệ thống recommend) ở mọi câu hỏi, áp dụng như nhau cho cả 3 arm. Ghi rõ điều này trong báo cáo như một limitation.

**③ Giữ điều kiện công bằng.**
Cùng base model, `temperature=0`, cùng ngày chạy, cùng seed. Ghi lại token + thời gian mỗi arm.

### 7.4 Bảng kết quả cần có trong báo cáo

| Metric | B1 Single-shot | B2 No-Judge | SYS Full | Hướng tốt |
|---|---|---|---|---|
| Citation validity (%) | | | | ↑ |
| Unsupported claim rate (%) | | | | ↓ |
| Spec completeness (/14) | | | | ↑ |
| MAJOR + CRITICAL issues | | | | ↓ |
| Token / spec | | | | ↓ |
| Thời gian (s) | | | | — |

Báo **mean ± std** trên 10 ý tưởng. Thêm 1 biểu đồ cột là đủ.

### 7.5 Việc nhỏ ăn điểm "soundness"

Lấy ngẫu nhiên **20 cặp (claim, nguồn)**, tự tay kiểm bằng mắt, so với kết quả LLM checker, báo cáo tỉ lệ khớp (VD: *"auto-checker khớp human 17/20 = 85%"*).

Nó biến metric tự động của bạn từ *"LLM nói vậy"* thành *"có validate"*. Tốn khoảng 1 tiếng. Rất đáng.

### 7.6 Ước lượng công sức §6 + §7

| Việc | Thời gian |
|---|---|
| Viết 10 ideas | 1h |
| Code B1 | 1h |
| Feature flag B2 | 30' |
| Script eval 4 metric | 4–5h |
| Chạy 30 lượt | ~1h |
| Human check 20 cặp | 1h |
| Viết báo cáo | 3h |
| **Tổng** | **~1.5–2 ngày** |

Phủ trọn deliverable #4, #7, #8.

---

## 8. Kiến trúc gợi ý

### Data model tối thiểu

```
Project        (id, title, raw_idea, created_at, owner)
SpecVersion    (id, project_id, version_no, status, created_at, parent_version_id)
Card           (id, spec_version_id, type, content, status, parent_card_id)
                 type   ∈ {problem, research_question, gap, contribution,
                           claim, evidence, constraint, open_question}
                 status ∈ {CONFIRMED, PROPOSED, MISSING, AMBIGUOUS,
                           UNSUPPORTED, CONFLICT}
Source         (id, project_id, title, authors, year, venue, doi, url,
                abstract, retrieved_from, credibility_score)
CardSource     (card_id, source_id, support_label)   -- SUPPORTED/WEAK/UNSUPPORTED
JudgeRun       (id, spec_version_id, judge_key, model, prompt_hash,
                raw_output, created_at)
Issue          (id, judge_run_id, severity, title, reason, suggestion, target_card_id)
Decision       (id, project_id, spec_version_id, question, options_json,
                chosen, custom_text, created_at)
ExperimentPlan (id, spec_version_id, plan_json)
ResourceEstimate(id, spec_version_id, model, vram_gb, hours, tokens, cost_usd)
```

`Card` + `Decision` + `SpecVersion` là ba bảng phủ được chức năng 8, 15 và mục 14 của spec.

### Cấu trúc repo

```
/app          frontend
/api          backend
/prompts      generator.md, judge_gap.md, judge_contribution.md,
              judge_experiment.md, judge_evidence.md, judge_readiness.md   ← deliverable #5
/verifier     citation_check.py, entailment.py                              ← deliverable #6
/eval
   ideas.json                                                               ← deliverable #4
   baseline_b1.py                                                           ← deliverable #7
   run_eval.py
   results/
/docs
   architecture.md                                                          ← deliverable #3
   evaluation_report.md                                                     ← deliverable #8
   sample_spec.pdf                                                          ← deliverable #10
```

---

## 9. Thứ tự làm

| Giai đoạn | Nội dung | % thời lượng |
|---|---|---|
| **1. Xương sống** | Data model + luồng Bước 1→2 (nhập ý tưởng, paraphrase, sinh thẻ 8 loại/6 trạng thái) + lưu Decision | 15% |
| **2. Grounding** | Semantic Scholar/arXiv integration + bảng related work + citation verifier | 20% |
| **3. Nội dung spec** | Gap 4-câu-hỏi + contribution + Claim–Evidence Card + experiment plan + resource estimator | 20% |
| **4. Judge loop** | 5 Judge song song + tổng hợp consensus/disagreement + lựa chọn A/B/C/Other + diff + version | 20% |
| **5. Export + UI polish** | PDF/Markdown export, stepper, trạng thái màu | 5% |
| **6. Đánh giá** | B1, B2, chạy eval, human check, viết báo cáo | 15% |
| **7. Video + docs** | Kiến trúc doc + quay demo | 5% |

**Quy tắc:** không sang giai đoạn sau khi giai đoạn trước chưa chạy end-to-end được. Thà có pipeline xấu chạy trọn 10 bước còn hơn 3 bước đẹp và 7 bước rỗng.

---

## 10. Checklist trước khi nộp

**Chức năng**
- [ ] Đủ 16 chức năng bắt buộc, mỗi cái demo được
- [ ] Option "Other" có ở **mọi** câu hỏi lựa chọn
- [ ] 5 Judge chạy độc lập, có log chứng minh không thấy output của nhau
- [ ] Issue có severity + trace về Judge
- [ ] Diff giữa 2 version hiển thị được
- [ ] Export PDF **và** Markdown

**Grounding**
- [ ] Không có paper nào do LLM bịa — mọi nguồn đến từ API thật
- [ ] Mỗi claim link được tới ít nhất 1 source record
- [ ] Verifier gắn nhãn support cho từng cặp (claim, source)

**Đánh giá**
- [ ] `eval/ideas.json` ≥ 8 ý tưởng
- [ ] B1 và B2 chạy được, cùng input, cùng scripted user
- [ ] Bảng 3 arm × 4+ metric, có mean ± std
- [ ] Auditor độc lập với Judge, chấm blind
- [ ] Human validation 20 cặp

**Bàn giao**
- [ ] `prompts/` đầy đủ 6 file, khớp với code đang chạy
- [ ] `docs/architecture.md` có sơ đồ
- [ ] `docs/evaluation_report.md` trả lời được: cải tiến gì / đo thế nào / hơn baseline bao nhiêu
- [ ] Video demo
- [ ] 1 sample spec đẹp nhất xuất PDF
- [ ] README chạy được từ máy trắng

---

## 11. Rủi ro mất điểm — xếp theo mức nguy hiểm

| # | Rủi ro | Hậu quả | Cách chặn |
|---|---|---|---|
| 1 | **Bỏ qua deliverable #7 + #8**, chỉ build web | Mất mảng lớn nhất của đồ án | Chừa 20–25% thời lượng cho §6–§7, lên lịch từ đầu |
| 2 | **Để LLM tự bịa paper** | Deliverable #6 rỗng, J4 vô nghĩa, mất luôn NFR traceability | Bắt buộc đi qua Semantic Scholar/arXiv API |
| 3 | **5 Judge dùng chung 1 context** | Vi phạm ràng buộc kiến trúc rõ ràng trong đề | 5 call độc lập, chạy song song, log riêng |
| 4 | **Auditor = Judge của chính mình** | Toàn bộ bảng số mất giá trị | Dùng model nhà cung cấp khác, chấm blind |
| 5 | **Không lưu Decision history** | Mất chức năng 8 + mục 14 của spec | Bảng `Decision` từ ngày 1 |
| 6 | **Hardcode prompt trong code** | Deliverable #5 khó tách, dễ lệch với code | `prompts/` ngay từ đầu |
| 7 | **Làm 5 tính năng "sáng tạo" nửa vời** | Không cái nào chứng minh được bằng số | Chọn đúng 1 cơ chế, đo kỹ |
| 8 | **Hiểu nhầm RTX 3090 là ràng buộc hạ tầng** | Tốn thời gian self-host LLM vô ích | Nó chỉ là nội dung estimator sinh ra |

---

*Tổng hợp từ `SPECRESEARCH_LOOP.docx` — text đầy đủ + 5 ảnh mockup. Cập nhật lại tài liệu này sau khi có câu trả lời của giảng viên về mục 7 bị thiếu.*
