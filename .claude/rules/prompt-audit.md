# RULE — Prompt audit & prompt log (deliverable #5)

Luôn có hiệu lực. Hai kho prompt riêng biệt, không trộn vào nhau.

Rule này chỉ nêu **yêu cầu**. Phần kiểm tra máy làm được đã chuyển thành hook
`.claude/hooks/prompt-guard.mjs` — xem bảng cuối file. Hook chặn là lệnh, không phải gợi ý:
fail ⇒ sửa ngay trong cùng turn, không để nợ.

## A. `prompts/` — prompt runtime của sản phẩm (BẮT BUỘC NỘP)

Cấm hardcode chuỗi prompt trong `backend/src` hay `frontend/src`; code chỉ được đọc file từ `prompts/`.

File bắt buộc:

```
prompts/generator.md
prompts/judge_gap.md
prompts/judge_contribution.md
prompts/judge_experiment.md
prompts/judge_evidence.md
prompts/judge_readiness.md
```

Mỗi file mở đầu bằng block:

```yaml
---
id: judge_gap
version: 1
model: deepseek-v4-pro | deepseek-v4-flash
inputs: [spec_json, sources_json]
output: JSON schema — xem cuối file
updated: YYYY-MM-DD
---
```

Yêu cầu nội dung:

1. Đủ 6 file trên.
2. `generator.md` bắt buộc yêu cầu structured JSON output, không phải văn bản tự do.
3. Mỗi judge prompt tự đứng độc lập — đọc riêng nó vẫn hiểu được nhiệm vụ, không tham chiếu
   context của judge khác.
4. `judge_evidence.md` phải kiểm tra citation có thật (đối chiếu `Source.doi` / `Source.url` lấy từ
   Semantic Scholar hoặc arXiv API), không cho LLM tự nhớ paper.
5. Không còn prompt hardcode trong source. Có hit ⇒ tách ra file `prompts/` rồi sửa code đọc file.
6. Frontmatter đủ field, `id` khớp tên file, `updated` khớp ngày sửa.

## B. `prompts/dev-log/` — prompt đã dùng để build sản phẩm

**Không nằm trong yêu cầu nộp.** Đề chỉ đòi phần A. Đây là log nội bộ tự đặt ra, để chứng minh quá
trình phát triển. Không bao giờ ưu tiên nó hơn deliverable #7 (baseline) và #8 (báo cáo đánh giá).

Ghi lại prompt người dùng gửi cho agent. Ghi **vào cuối mỗi turn có thay đổi file** trong `backend/`,
`frontend/`, `prompts/`, `docs/`, `.claude/`, hoặc `.agents/`. Turn chỉ hỏi–đáp, chỉ đọc file thì
không ghi. (Config agent nằm trong phạm vi vì nó cũng là một phần của quá trình build.)

Tên file — số thứ tự 3 chữ số, tăng dần, không bao giờ dùng lại:

```
prompts/dev-log/NNN__YYYY-MM-DDTHHMM__slug-ngan.md
ví dụ: 007__2026-08-15T1432__judge-gap-retry-loop.md
```

Dùng `T` và không dấu hai chấm — Windows không cho `:` trong tên file.

Nội dung file:

```markdown
---
stt: 007
timestamp: 2026-08-15T14:32+07:00
model: claude-opus-5
scope: [backend/src/judge, prompts/judge_gap.md]
---

## Prompt
<nguyên văn prompt của người dùng, không tóm tắt, không sửa chính tả>

## Kết quả
<1–3 dòng: đã đổi gì, file nào>
```

Số thứ tự kế tiếp và timestamp do hook tính sẵn và đọc ra trong thông báo chặn. Prompt nguyên văn của
turn hiện tại được hook lưu ở `.claude/.state/turn.json` (field `prompt`) — chép từ đó, đừng nhớ lại.

## Hook enforce cái gì

| Sự kiện | Kiểm tra | Chặn? |
| --- | --- | --- |
| Ghi/sửa `prompts/*.md` | frontmatter đủ field · `id` khớp tên file · `updated` = hôm nay · #2 · #4 | có |
| Cuối turn | #1 đủ 6 file · #5 không hardcode · #2 · #4 · #6 · dev-log của turn | có |
| Cuối turn | #3 (heuristic: judge nhắc tên judge khác) · dev-log trùng/đứt số | cảnh báo |

Ngoài phạm vi hook, phải tự giữ: chất lượng nội dung prompt, #3 khi không lộ ra bằng tên file, và
tính chính xác của `## Kết quả` trong dev-log.

Hook chỉ bật kiểm tra "đủ 6 file" khi `prompts/` đã có ít nhất 1 file — repo trống không bị chặn.

## Commit

Prompt version cùng Git. Không đưa `prompts/` vào `.gitignore`. Commit prompt kèm code dùng nó, cùng
một commit. `.claude/.state/` là state tạm của hook, đã gitignore.
