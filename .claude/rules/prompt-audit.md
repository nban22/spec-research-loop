# RULE — Prompt audit & prompt log (deliverable #5)

Luôn có hiệu lực. Hai kho prompt riêng biệt, không trộn vào nhau.

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
model: claude-opus-5 | deepseek-chat
inputs: [spec_json, sources_json]
output: JSON schema — xem cuối file
updated: YYYY-MM-DD
---
```

### Audit checklist — chạy mỗi khi tạo/sửa bất kỳ file nào trong `prompts/`

1. Đủ 6 file trên. Verify: `ls prompts/*.md | wc -l` ≥ 6.
2. `generator.md` bắt buộc yêu cầu structured JSON output, không phải văn bản tự do.
3. Mỗi judge prompt tự đứng độc lập — đọc riêng nó vẫn hiểu được nhiệm vụ, không tham chiếu context của judge khác.
4. `judge_evidence.md` phải kiểm tra citation có thật (đối chiếu `Source.doi` / `Source.url` lấy từ Semantic Scholar hoặc arXiv API), không cho LLM tự nhớ paper.
5. Không còn prompt hardcode. Verify:
   `grep -rniE "you are an?|hãy đóng vai|system prompt" backend/src frontend/src --include=*.ts --include=*.tsx`
   → phải rỗng. Có hit ⇒ tách ra file `prompts/` rồi sửa code đọc file.
6. Block frontmatter ở trên có đủ và `updated` khớp ngày sửa.

Fail bất kỳ mục nào ⇒ sửa ngay trong cùng turn, không để nợ.

## B. `prompts/dev-log/` — prompt đã dùng để build sản phẩm

**Không nằm trong yêu cầu nộp.** Đề chỉ đòi phần A. Đây là log nội bộ tự đặt ra, để chứng minh quá trình phát triển. Không bao giờ ưu tiên nó hơn deliverable #7 (baseline) và #8 (báo cáo đánh giá).

Ghi lại prompt người dùng gửi cho Claude Code. Ghi **vào cuối mỗi turn có thay đổi file** trong `backend/`, `frontend/`, `prompts/`, hoặc `docs/`. Turn chỉ hỏi–đáp, chỉ đọc file thì không ghi.

Tên file — số thứ tự 3 chữ số, tăng dần, không bao giờ dùng lại:

```
prompts/dev-log/NNN__YYYY-MM-DDTHHMM__slug-ngan.md
ví dụ: 007__2026-08-15T1432__judge-gap-retry-loop.md
```

Dùng `T` và không dấu hai chấm — Windows không cho `:` trong tên file.

Lấy số kế tiếp:

```bash
printf "%03d\n" $(( $(ls prompts/dev-log | grep -oE '^[0-9]{3}' | sort -n | tail -1 | sed 's/^0*//' | grep . || echo 0) + 1 ))
```

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

Verify sau khi ghi: `ls prompts/dev-log | tail -3` — số thứ tự liên tục, không trùng.

## Commit

Prompt version cùng Git. Không đưa `prompts/` vào `.gitignore`. Commit prompt kèm code dùng nó, cùng một commit.
