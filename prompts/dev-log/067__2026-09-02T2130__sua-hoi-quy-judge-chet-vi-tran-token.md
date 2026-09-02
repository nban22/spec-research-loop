---
stt: 067
timestamp: 2026-09-02T21:30+07:00
model: claude-opus-5
scope:
  [
    backend/src/llm/llm.service.ts,
    backend/src/llm/llm.service.spec.ts,
    backend/src/contracts/enums.ts,
    prompts/judge_experiment.md,
    frontend/src/lib/error-code.ts,
  ]
---

## Prompt
vì sao mỗi lần chạy judge thì luôn tồn tại ít nhất 1 judge failed? Ví dụ:
J3
Experiment
Do the experiments actually prove the claims?

Failed — this judge is skipped

## Kết quả
**Đây là hồi quy do dev-log 065 gây ra, sửa trên chính nhánh đó trước khi nó kịp vào `main`.**

Không đúng là "luôn có ít nhất 1 judge failed". Trên 19 lượt chạy đủ 5 judge: **12 lượt hỏng 0
con**, 5 lượt hỏng 1, 2 lượt hỏng 2. Nhưng **toàn bộ 4 lượt có judge khác J4 chết đều sau 13:52
ngày 02-09** — đúng lúc code 065 chạy.

Trần 8 000 token đầu ra **vốn đã tồn tại** cho cả 5 judge (`opts.maxTokens ?? 8000`). Cái 065 đổi là
**cách xử lý khi đụng trần**: trước đó câu bị cắt trông giống câu sai schema nên được **thử lại**,
và vòng thử lại đó **cứu thật** — `judge_experiment` 12 lần, `judge_evidence` 10 lần, `judge_gap` và
`judge_readiness` mỗi con 1 lần. Nó sống được vì lượt sau không phải cùng một prompt: lỗi zod được
đính vào, đầu vào đổi, model trả câu ngắn hơn.

065 chặn fail-fast đúng về nguyên tắc nhưng **gỡ mất đường cứu duy nhất mà không thay bằng gì**.
Câu viết trong đó — *"lượt sau cũng dài đúng ngần ấy và cũng bị cắt đúng chỗ đó"* — **sai**: nó suy
ra từ 3 lượt hỏng của J4 mà không kiểm 24 lượt thành công nằm ngay cạnh trong cùng bảng.

Ba tầng sửa:

1. **Thử lại kèm lệnh viết ngắn lại**, thay vì dừng ngay. Biến cái đang xảy ra *tình cờ* thành *cố
   ý*: nói thẳng với model là câu trước bị cắt và yêu cầu bỏ bớt phát hiện nhẹ, thay vì để nó đoán
   từ một thông báo lỗi zod nói về chuyện khác. Hết lượt mới báo `LLM_OUTPUT_TRUNCATED`.
2. **Trần theo số đo, không theo mặc định.** 8 000 → **12 000** (J1·J2·J5), **16 000** (J3), **24
   000** (J4). Mẫu cũ thiên lệch: "lượt tốn nhiều nhất là 7 771" chỉ đúng với những lượt *sống sót*
   — lượt to hơn đã chết trước khi được ghi là thành công. Nâng trần **không tốn thêm tiền**:
   `max_tokens` là mức chặn, không phải mức mua.
3. **Chặn đầu ra theo thiết kế ở `judge_experiment`** (version 1 → 2): tối đa 10 phát hiện nặng
   nhất, và phải nói trong `summary` nếu đã bỏ bớt — đúng luật `judge_evidence` đã có. J3 là con
   phụ thuộc vòng thử lại nặng nhất (12/21 lượt) nên nó cần luật này nhất.

**Kiểm bằng model thật** trên đúng ba bản spec đã chết — cả ba đều sống ở **lượt đầu**, và cả ba đều
vượt trần 8 000 cũ:

| Judge | spec version | Kết quả |
| --- | --- | --- |
| J3 `experiment` | `9613659e` (chết 14:05) | OK · 1 lượt · 10 753 token · 7 phát hiện |
| J4 `evidence` | `8316d3fd` (chết 13:57 ở trần 16 000) | OK · 1 lượt · 13 347 token · 7 phát hiện |
| J2 `contribution` | `c9d59252` (chết 13:56) | OK · 1 lượt · 9 918 token · 8 phát hiện |

J3 trả đúng thứ luật mới đòi: *"I report 7 issues; roughly 3 more minor issues"*. J2 tiêu 9 918
token — tự nó đã chứng minh câu "8 000 vừa đủ cho bốn judge nói về spec" trong 065 cũng sai.

backend `lint 0 · tsc 0 · jest 445/445`.
