---
stt: 026
timestamp: 2026-08-26T21:56+07:00
model: claude-opus-5
scope: [prompts/dev-log]
---

## Prompt
giúp tôi đọc source code để vẽ lại kiến trúc của ứng dụng nhé, nói rõ kiến trúc đang có, vẽ sơ đồ sao cho dễ hình dung, ko phải vẽ đại nhiều dẫn tới loãng thông tin, mục đích tôi hiểu kiến trúc để vấn đáp, trả lời cho giảng viên khi bị yêu cầu trả lời nhé

## Kết quả
Turn chỉ đọc source (backend/src, frontend/src, prisma/schema.prisma, eval/, deploy/) — không sửa file nào trong `backend/`, `frontend/`, `prompts/` hay `docs/`.
Sản phẩm là một Artifact HTML độc lập "Kiến trúc SpecResearch Loop" (7 sơ đồ SVG: triển khai · xương sống dữ liệu · vòng đời job+SSE · pipeline B1→B5 · verifier 5 tầng · vòng judge · apply thành version mới, cộng §12 điểm yếu và §13 sổ tay 14 câu vấn đáp) đặt ngoài repo, ở scratchpad.
Chưa đưa vào `docs/`; nếu muốn commit cạnh `product-flow-map.html` thì cần một turn riêng.
