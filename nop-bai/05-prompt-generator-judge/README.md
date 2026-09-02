# 05 · Prompt của Generator và các Judge

> Sản phẩm bàn giao #5 · Trạng thái: **đủ**

| Thư mục | Nội dung |
| --- | --- |
| [`prompts/`](prompts/) | **18 prompt runtime** — bản chụp của `prompts/*.md` trong repo |
| [`dev-log/`](dev-log/) | **83 file** ghi nguyên văn prompt đã dùng để *xây dựng* sản phẩm |
| [MANIFEST.md](MANIFEST.md) | Danh sách 18 file kèm `id`, version, model, ngày, **sha256** |

Hai kho này **không được trộn vào nhau**: `prompts/` là prompt runtime của sản phẩm (đề bài đòi),
`dev-log/` là log quá trình phát triển (đề **không** đòi, tự đặt ra).

**Bản chụp có đúng bằng bản chạy không?** Đó chính là việc của `MANIFEST.md`: nó ghi sha256 của
từng file, và cùng giá trị đó nằm trong `LlmCall.prompt_hash` của **mọi** lời gọi trong database.
Một lệnh là đối chiếu được, không phải tin lời.

## 5 Judge của đề — đủ cả 5

| Judge | Nhiệm vụ (theo đề) | File |
| --- | --- | --- |
| J1 · Research Gap | Gap có thật sự được tài liệu hỗ trợ không | `prompts/judge_gap.md` |
| J2 · Contribution | Contribution có mới, rõ, có bị phóng đại không | `prompts/judge_contribution.md` |
| J3 · Experiment | Thí nghiệm có đủ chứng minh claim không | `prompts/judge_experiment.md` |
| J4 · Evidence | Citation có thật sự hỗ trợ nội dung đi kèm không | `prompts/judge_evidence.md` |
| J5 · Conference Readiness | Originality · significance · soundness · clarity · reproducibility | `prompts/judge_readiness.md` |

Cộng `prompts/generator.md` là đủ phần đề đòi. 12 file còn lại là prompt của các bước khác
(related work, gap, contribution, experiment, options, revise, verifier, auditor, baseline B1,
overclaim, conflict) — nộp kèm để bức tranh đầy đủ, không phải để đếm cho nhiều.

## Ba ràng buộc được ép bằng máy, không phải bằng lời hứa

### 1. Không có prompt nào hardcode trong source

```bash
grep -rn "You are a" backend/src frontend/src    # kết quả rỗng
```

Code chỉ được **đọc file** từ `prompts/`. Luật này do hook `.claude/hooks/prompt-guard.mjs` enforce,
chạy cuối mỗi lượt làm việc và **chặn** nếu có chuỗi prompt lọt vào source. Nó cũng kiểm frontmatter
đủ field, `id` khớp tên file, và `updated` khớp ngày sửa.

### 2. Prompt nộp = prompt đã chạy, chứng minh bằng hash

Mỗi lời gọi LLM ghi một bản ghi `LlmCall` mang `prompt_id` **và `prompt_hash`** — hash của đúng nội
dung file tại thời điểm gọi. `JudgeRun` cũng mang cặp đó.

Hệ quả kiểm được: nếu ai sửa một prompt sau khi chạy thí nghiệm, hash trong database sẽ không khớp
hash của file đang nộp. Script tổng hợp `backend/eval/score.ts` còn **từ chối tổng hợp** nếu một
`prompt_id` có hai `prompt_hash` khác nhau trong cùng một batch — nghĩa là không thể vô tình trộn
kết quả của hai phiên bản prompt.

### 3. Năm judge không thấy nhau

Đề nói *"các Judge phải đánh giá riêng trước khi xem nhận xét của nhau"*. Cách yếu là dặn trong
prompt. Cách đã làm:

- 5 lời gọi LLM **song song**, mỗi lời gọi một context sạch, không lời gọi nào nhận output của lời
  gọi khác.
- `JudgeRun.input_digest` = hash của `spec_json + sources_json` gửi đi. Bằng chứng nằm ở dữ liệu:
  **5 run cùng một `input_digest`, `raw_output` khác nhau, `started_at` trùng nhau**.
- Mỗi judge prompt tự đứng độc lập — đọc riêng một file vẫn hiểu được nhiệm vụ, không tham chiếu
  context của judge khác.

Kiểm bằng `GET /spec-versions/:id/judge-runs`.

## Hai luật nội dung đáng chú ý

**`generator.md` bắt buộc structured JSON output**, không phải văn bản tự do — nên đầu ra vào thẳng
bảng `Card` qua zod schema, không có tầng parse đoán mò.

**`judge_evidence.md` không cho LLM tự nhớ paper.** Nó phải đối chiếu `Source.doi` / `Source.url`
lấy từ Semantic Scholar hoặc arXiv API. Cùng luật đó có mặt trong `generator.md`: *"Never name a
specific paper, author, venue, DOI or year"* — ở bước phân rã ý tưởng, hệ thống **chưa có quyền**
nhắc tới bất kỳ tài liệu nào, vì nguồn thật chỉ xuất hiện ở bước sau.

## Quá trình phát triển

[`dev-log/`](dev-log/) — **83 file**, mỗi file ghi nguyên văn một prompt đã dùng để xây dựng sản phẩm,
kèm timestamp, model, và phạm vi file bị đổi. Đề **không đòi** phần này; đây là log tự đặt ra để quá
trình phát triển kiểm chứng được, không phải chỉ kết quả cuối.
