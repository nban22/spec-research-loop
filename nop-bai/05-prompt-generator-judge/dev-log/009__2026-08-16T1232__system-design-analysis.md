---
stt: 009
timestamp: 2026-08-16T12:32+07:00
model: claude-opus-5
scope: [docs/SYSTEM_DESIGN_ANALYSIS.md, CLAUDE.md]
---

## Prompt
quét qua toàn bộ docs, focus chủ yếu vào @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/SPECRESEARCH_LOOP-kim-chi-nam.md vì đây là requirements đến từ @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/SPECRESEARCH LOOP.docx  và @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample1.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample2.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample3.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample4.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample5.png  ngẫm đủ 5 ảnh này nhé, sample mà giảng viên cho dùng để tham khảo, thì tôi cần bạn hiểu để giúp tôi lên bản design system analysis dựa vào template tôi cung cấp là @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/system-design-analysis-template.md , nên nhớ yêu cầu là mvp nhé, không phải production ready nên không cần over engineering, tuyệt đối ko over engineer, đủ yêu cầu trong đồ án là đủ (mvp nhưng đủ system để trình bày với giảng viên nhé, ví dụ trong docs ko yêu cầu auth, nhưng vì tính năng có quản lý version, thì khi đó nên có auth basic để trình bày dễ hơn, rằng có user login signup.... như vậy là dễ trình bày nhé)
research tham khảo best practice pattern trên network nếu cần nhé

## Kết quả
Tạo `docs/SYSTEM_DESIGN_ANALYSIS.md` theo đúng khuôn `docs/system-design-analysis-template.md`: 14 tính
năng phân hạng 5 Core / 6 Supporting / 3 Trivial; 5 Core phân tích đủ 8 mục F.1–F.8, Supporting rút gọn
F.1/F.4/F.5 (+F.8 cho auth, SSE, export). Doc trỏ về `ARCHITECTURE.md` cho ERD/API/thuật toán thay vì
chép lại; nó chỉ trả lời "thiết kế vỡ ở đâu và đánh đổi cái gì".
Kết luận chống over-engineer: QPS đỉnh < 1, tổng dữ liệu ~100 MB ⇒ một tiến trình + một Postgres, có
bảng riêng liệt kê các khối cố ý vắng mặt (LB, Redis, queue, S3, replica, shard). Nút thắt thật được
chỉ ra là latency LLM, rate limit API học thuật (tra bằng web search: S2 pool chung 5.000 req/5 phút,
có key 1 req/s; OpenAlex 100k/ngày) và ~8s CPU embedding trong tiến trình đơn luồng.
Quyết mới 13 điểm ở §4.4, đáng chú ý: `Promise.allSettled` + ngưỡng ≥3/5 judge, gộp IssueGroup bằng rule
chứ không bằng LLM, `UNIQUE(project_id, version_no)` làm optimistic lock chống hai tab tạo hai v2,
`score.ts` từ chối tổng hợp khi prompt_hash lệch giữa batch, verifier fail-closed nhưng Crossref
fail-open. Cũng nêu một mâu thuẫn nội bộ của `ARCHITECTURE.md` §5 (`/issue-groups/:id/options` trả
`options[]` trong khi quy ước nói mọi endpoint gọi LLM trả `jobId`) và việc hai dev-log cùng số 008.
Thêm một dòng trỏ tới file mới trong `CLAUDE.md`.
