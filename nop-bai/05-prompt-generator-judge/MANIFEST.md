# MANIFEST — 18 prompt runtime

> Chụp lại ngày **2026-09-03** trên nhánh `main`.
>
> `sha256` là 16 ký tự đầu của hash nội dung file. Cùng giá trị đó được ghi vào
> `LlmCall.prompt_hash` và `JudgeRun.prompt_hash` **mỗi lần gọi** — nên đối chiếu cột này với
> database là biết ngay prompt nộp có phải prompt đã chạy hay không.
>
> Sinh lại bảng này:
> ```bash
> cd prompts && for f in *.md; do printf "%s %s\n" "$f" "$(sha256sum "$f" | cut -c1-16)"; done
> ```

## Sáu file đề bài đòi

| File | id | ver | Model | Cập nhật | Dòng | sha256 |
| --- | --- | --- | --- | --- | ---: | --- |
| `generator.md` | generator | 1 | deepseek-v4-pro | 2026-09-02 | 148 | `8c2fc63e0706937f` |
| `judge_gap.md` | judge_gap | 1 | deepseek-v4-pro | 2026-08-16 | 96 | `281b385cbc5ed729` |
| `judge_contribution.md` | judge_contribution | 1 | deepseek-v4-flash | 2026-08-16 | 102 | `2092e0f2a0f1ccf2` |
| `judge_experiment.md` | judge_experiment | 2 | deepseek-v4-pro | 2026-09-02 | 110 | `7c7e1031857cc42c` |
| `judge_evidence.md` | judge_evidence | 2 | deepseek-v4-flash | 2026-09-02 | 122 | `32c45e2bc891eb4f` |
| `judge_readiness.md` | judge_readiness | 1 | deepseek-v4-pro | 2026-08-16 | 100 | `5f903b8239b9f047` |

## Mười hai file còn lại của pipeline

| File | id | ver | Model | Cập nhật | Dòng | sha256 | Vai trò |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `generator_related_work.md` | generator_related_work | 1 | deepseek-v4-pro | 2026-08-16 | 63 | `8e214b1d4d345c72` | B2 · bảng related work 4 cột |
| `generator_gap.md` | generator_gap | 1 | deepseek-v4-pro | 2026-09-02 | 94 | `9a68f1365142609b` | B2 · gap trả lời đủ 4 câu hỏi |
| `generator_contribution.md` | generator_contribution | 1 | deepseek-v4-pro | 2026-08-16 | 80 | `e1d117556373a91d` | B3 · contribution + claim–evidence |
| `generator_experiment.md` | generator_experiment | 2 | deepseek-v4-pro | 2026-09-01 | 108 | `9c7a9f9cc2d54afa` | B3 · kế hoạch thí nghiệm |
| `generator_options.md` | generator_options | 1 | deepseek-v4-pro | 2026-09-02 | 79 | `ecf41c5703ab407a` | Sinh phương án A/B/C có giải thích + ví dụ |
| `generator_revise.md` | generator_revise | 1 | deepseek-v4-pro | 2026-09-02 | 91 | `92ea0badd23102ee` | Dựng bản nháp version mới từ quyết định của người dùng |
| `judge_overclaim.md` | judge_overclaim | 1 | deepseek-v4-pro | 2026-08-29 | 122 | `ce7a6a0500a83ef5` | Bắt claim phóng đại (làn B) |
| `conflict_pair.md` | conflict_pair | 1 | deepseek-v4-flash | 2026-08-31 | 78 | `ca7da0a33b4b11fa` | Phát hiện hai nguồn nói ngược nhau |
| `verifier_entailment.md` | verifier_entailment | 1 | deepseek-v4-flash | 2026-08-16 | 80 | `6ca575ecd7b07d0b` | **Tầng L4** của citation verifier |
| `verifier_passage.md` | verifier_passage | 1 | deepseek-v4-flash | 2026-08-31 | 76 | `c8f14254742abb6f` | **Tầng L3b** — đọc đoạn toàn văn arXiv |
| `auditor.md` | auditor | 1 | deepseek-v4-pro | 2026-08-16 | 75 | `c24fd0439439e883` | Chấm **blind** cho báo cáo đánh giá |
| `baseline_b1.md` | baseline_b1 | 1 | deepseek-v4-flash | 2026-08-16 | 70 | `e41c040f37ec1043` | Arm B1 — một prompt ra thẳng spec 14 mục |

---

## Vì sao có `auditor.md` và `baseline_b1.md` ở đây

Hai file này **không phục vụ người dùng**, chúng phục vụ việc đo:

- `baseline_b1.md` **là** baseline B1. Nộp nó ra là nộp luôn định nghĩa của đường cơ sở — người chấm
  đọc được chính xác baseline yếu đến mức nào, thay vì phải tin một dòng mô tả.
- `auditor.md` chấm mù các spec sinh ra, với nhãn arm bị giấu (`X`, `Y`, `Z`). Nó phải nằm trong bộ
  prompt nộp vì điểm blind trong báo cáo đánh giá phụ thuộc hoàn toàn vào nội dung file này.

## Frontmatter

Mọi file mở đầu bằng khối YAML:

```yaml
---
id: judge_gap
version: 1
model: deepseek-v4-pro
inputs: [spec_json, sources_json]
output: JSON schema — xem cuối file
updated: 2026-08-16
---
```

Hook `.claude/hooks/prompt-guard.mjs` **chặn** mỗi lần ghi file nếu frontmatter thiếu field, `id`
không khớp tên file, hoặc `updated` không phải ngày sửa. Nên bảng trên không thể lệch khỏi thực tế
mà không ai biết.
