---
stt: 054
timestamp: 2026-09-01T10:31+07:00
model: claude-opus-5
scope: [backend/src/llm, prompts/dev-log]
---

## Prompt

```
<task-notification>
<task-id>bk2mzg740</task-id>
<summary>Monitor event: "full A-Z spec flow steps on hosted API"</summary>
<event>PASS  chốt quyết định S1  — không có câu hỏi nào treo
FAIL  phân tích sinh ra từ khoá tìm nguồn  — []
```

_Không phải prompt của người dùng — đây là sự kiện của monitor theo dõi lượt chạy full flow, và
hook ghi nó vào `turn.json` như prompt mở màn của turn này. Prompt thật của con người vẫn là cái
ở dev-log [053](053__2026-09-01T0950__chua-kiem-chung-khong-phai-weak.md); file này tách ra vì
lượt chạy nền rơi sang một turn khác, giống hệt tình huống của [051](051__2026-09-01T0036__ablation-lan-a-doc-bang.md)._

## Kết quả

Chạy full flow sinh spec trên API host thì luồng chết ngay ở bước đầu: `analyze` FAILED sau 111
giây, log container nói `Không gọi được DeepSeek: terminated`. Các bước sau đổ theo **đúng thiết
kế** (không có nguồn ⇒ related-work và gap từ chối; `queries: []` bị zod chặn) — chỉ có một lỗi
thật.

`LlmCall` 24h gần nhất: `generator` 7 lượt hỏng 1 (14%, lâu nhất 119s) · `verifier_entailment`
64 lượt hỏng 1 vì schema · năm prompt còn lại 0 lỗi. `generator` chạy `reasoning_effort: high`
với 12k token nên mất 77–119 giây mỗi lượt và thỉnh thoảng bị cắt kết nối giữa chừng.

Lỗi transient, nhưng `LlmService` cho nó **đúng 0 lần thử lại**: JSON sai schema được 3 lượt,
còn `catch` quanh `provider.complete` ném thẳng. Chính sách retry lo cho lỗi của *mô hình* mà bỏ
trống lỗi của *đường truyền* — trong khi cái transient lại là cái sau, và một lần đứt giết cả
chuỗi 10 bước.

Sửa bằng `src/llm/llm-transient.ts` (hàm thuần, có test): phân loại theo hình dạng lỗi —
`status` 429/5xx, `APIConnectionError`, mã socket của undici, lời văn `terminated`. 4xx còn lại
**không** thử lại. `LlmService` thử tối đa 3 lượt, backoff 2s/6s, tách khỏi `maxRetries` của
schema. Nhận diện ở **cả** provider lẫn `LlmService` — test bắt được rằng nếu chỉ phân loại ở
provider thì provider khác ném lỗi mạng trần sẽ không được gọi lại. `attempts` cố ý không cộng
lần thử lại vì mạng, vì `eval/score.ts` đọc nó theo nghĩa "số lần mô hình phải sửa JSON".

backend `jest 321/321 · lint 0 · build 0` · merge `81617cb`, CI xanh.

**Trùng số 053** mà hook cảnh báo là **va chạm giữa hai làn**, không phải lỗi đánh số của lượt
này: PR #37 của làn C (`c-ui/motion-polish`) mang theo
`053__2026-09-01T1140__motion-cho-ba-man-hinh-lan-c.md` và merge vào `main` trước lượt push của
làn A, trong khi `053__2026-09-01T0950__chua-kiem-chung-khong-phai-weak.md` đã commit từ trước
đó. Không đổi tên file của làn khác — cùng lý lẽ đã áp cho 008/021/026/027/028 ở dev-log 051.
Chỗ đáng sửa nằm ở quy ước: số thứ tự dev-log là tài nguyên dùng chung mà ba làn cấp phát độc
lập, nên còn làm việc song song thì còn trùng.
