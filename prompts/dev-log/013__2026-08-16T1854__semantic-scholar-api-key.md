---
stt: 013
timestamp: 2026-08-16T18:54+07:00
model: claude-opus-5
scope: [backend/.env, .env.example, backend/src/common/env.ts, backend/src/sources/source.client.ts, README.md, docs/IMPLEMENTATION_PROMPT.md, docs/SYSTEM_DESIGN_ANALYSIS.md]
---

## Prompt
bổ sung cho tôi nhé "Dear An,

Thank you for requesting a Semantic Scholar API key! Your request has been approved. Here are the details:

S2 API Key: .....
Rate limit:
1 request per second, cumulative across all endpoints. This means that in a given second you may send only 1 request to our system and expect a successful response.
Please set your rate limit to below this threshold to avoid rejected requests.

 

The API key needs to be sent in the header of the request as x-api-key. For more instructions, visit our tutorial page."

## Kết quả
Điền key vào `backend/.env`; xác minh bằng curl thật tới `/graph/v1/paper/search` → HTTP 200. Không sửa
logic — `SourceClient` đã tự chọn chế độ lúc runtime đúng như thiết kế; chỉ cập nhật comment ở
`env.ts` + `source.client.ts` (ghi rõ hạn mức cộng dồn mọi endpoint ⇒ mọi lời gọi S2 dùng chung một
gate `s2`, nhịp 1.100ms nằm dưới ngưỡng) và sửa trạng thái "chưa được cấp" ở README, `.env.example`,
IMPLEMENTATION_PROMPT §2, SYSTEM_DESIGN_ANALYSIS §1.5. `tsc --noEmit` sạch.
