# 16 chức năng bắt buộc → chỗ cài đặt

> §3 đề bài liệt kê 16 chức năng. Bảng này chỉ đúng file và đúng màn hình cho từng cái, để không
> phải tin lời — mở ra là thấy.
>
> Màn hình: `S1..S5` = 5 bước wizard (`/projects/:id/step/N`) · `VER` = `/projects/:id/versions`.

| # | Chức năng | Module backend | Màn hình | Thành phần chính |
| --- | --- | --- | --- | --- |
| 1 | Nhập ý tưởng nghiên cứu | `project` | trang chủ, `S1` | ô nhập + panel "Ý tưởng ban đầu" |
| 2 | Diễn giải lại ý tưởng | `generator` (`PARAPHRASE`) | `S1` cột 2 | "Cách hệ thống đang hiểu ý tưởng" + mức chắc chắn |
| 3 | Phân rã problem/gap/claim/contribution/evidence | `generator` (`DECOMPOSE`) → `Card` | `S1` → `S3` | `SpecCard`, bản đồ khái niệm |
| 4 | Tìm kiếm và quản lý nguồn | `sources` (S2 → OpenAlex → Crossref) | `S2` cột 1 | `KeywordChipInput`, `SourceFilterList` |
| 5 | Tạo bảng related work | `sources` + `generator` (`RELATED_WORK`) | `S2` cột 2 | `RelatedWorkTable` |
| 6 | Phát hiện ambiguity và conflict | `generator` gán `AMBIGUOUS`/`CONFLICT`; `conflict` phát hiện hai nguồn nói ngược nhau; J1/J2 bắt thêm | `S1`, `S2`, `S4` | `StatusChip`, `Card.conflict_with_card_id` |
| 7 | Lựa chọn có giải thích, ví dụ, **và "Other"** | `decision` (`OPTIONS`) | mọi bước, cột 3 | `OptionList` — frontend **luôn** chèn `Other` |
| 8 | Lưu quyết định người dùng | `decision` → bảng `Decision` | mọi bước + `VER` | `DecisionLog` |
| 9 | Sinh kế hoạch thí nghiệm | `generator` (`EXPERIMENT`) → `ExperimentPlan` | `S3` cột 2 | `ExperimentPlanList` |
| 10 | Ước lượng tài nguyên | `estimator` — **công thức, không LLM** | `S3` cột 3 | `StatTileGrid` + cảnh báo giảm quy mô nếu vượt RTX 3090 |
| 11 | Tạo research spec 14 mục | `spec` | `S3` → `S5` | `SpecChecklist` |
| 12 | Chạy nhiều Judge độc lập | `judge` + `jobs` (SSE) | `S4` cột 2 | `JudgePanel`, `JudgeCard` |
| 13 | Tổng hợp điểm đồng thuận và bất đồng | `judge` → `IssueGroup` | `S4` cột 2 | `IssueTable` + `ConsensusMeter` + `JudgeTracePill` |
| 14 | Cho người dùng quyết định sửa đổi | `decision` + `spec` | `S4` cột 3 | `OptionList` → `BeforeAfter` → `ConfirmDialog` |
| 15 | Quản lý version và hiển thị diff | `spec` (jsdiff) | `VER` | `VersionTimeline` + `DiffView` |
| 16 | Xuất bản spec cuối cùng | `spec/export` (Markdown + Puppeteer PDF) | `S5` | `ExportBar` — **bị chặn bởi verifier gate** |

**16/16.** Bảng gốc kèm lý do gộp bước nằm ở [03-tai-lieu-kien-truc/ARCHITECTURE.md](03-tai-lieu-kien-truc/ARCHITECTURE.md) §3.

---

## Chi tiết bị chôn trong 10 bước quy trình

16 gạch đầu dòng ở trên không nói hết. Đề còn đòi năm thứ cụ thể sau, và cả năm đều được ép xuống
tầng dữ liệu:

| Đề đòi | Chỗ cài đặt | Kiểm bằng cách nào |
| --- | --- | --- |
| **8 loại thẻ × 6 trạng thái** | `Card.type` và `Card.status` là hai enum trong `schema.prisma` | Mở bản đồ khái niệm ở `S1`, đếm nhóm |
| **Gap phải trả lời 4 câu hỏi** | `Card.payload` của `GAP`: `prior_work` · `limitation` · `why_it_matters` · `testable_experiment` | Bấm một thẻ `GAP` ở `S2` |
| **Claim–Evidence Card 5 trường** | `Card.payload` của `CLAIM`: `baseline` · `metric` · `evidence` · `refutation_condition` (+ bản thân claim ở `title`/`body`) | Bấm một thẻ `CLAIM` ở `S3`. **`refutation_condition` là trường hay bị quên nhất** — có ở đây |
| **5 Judge có tên, chạy độc lập** | `prompts/judge_gap.md` · `judge_contribution.md` · `judge_experiment.md` · `judge_evidence.md` · `judge_readiness.md` | `GET /spec-versions/:id/judge-runs` — 5 bản ghi cùng `input_digest`, `raw_output` khác nhau |
| **Issue có mức độ + trace về judge nào** | `Issue.severity` ∈ {CRITICAL, MAJOR, MINOR} · `Issue.judge_run_id` · `IssueGroup.judge_keys` | Bảng tổng hợp issue ở `S4` — pill `J1 J3 J4` trên từng dòng |

---

## Mục "được đánh giá cao" của đề

Đề nói sinh viên được đánh giá cao khi **đề xuất một cơ chế mới và chứng minh bằng số liệu** rằng nó
cải thiện ít nhất một trong sáu điều. Dự án chọn **đúng một cơ chế** và đo nó, thay vì làm ba cái
nửa vời:

| Điều đề liệt kê | Cơ chế | Số đo |
| --- | --- | --- |
| **Giảm claim không có bằng chứng ↓** | Citation Verifier 5 tầng + gate chặn export | `citation_validity` 0,400 → 1,000 · xem [07-baseline/](07-baseline/) |
| Giảm bias của Judge ↓ | `IssueGroup.disagreement_score` = `1 − agreement_count/5` | panel đồng thuận ở `S4` |
| Giảm số câu hỏi không cần thiết ↓ | Dùng `disagreement_score` để **ưu tiên hỏi đúng chỗ đáng ngờ nhất** | sắp xếp bảng issue ở `S4` |

Cơ chế thứ nhất là trọng tâm và là thứ có bảng số. Hai cái sau đã cài đặt và dùng được, nhưng
**chưa có thí nghiệm riêng đo chúng** — nói rõ để không nhận công quá phần đã làm.
