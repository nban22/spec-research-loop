---
stt: 005
timestamp: 2026-08-16T01:43+07:00
model: claude-opus-5
scope: [docs/DESIGN_SYSTEM.md, docs/ARCHITECTURE.md]
---

## Prompt
Bạn đang thiết kế toàn bộ hệ thống cho đồ án SpecResearch Loop. Nhiệm vụ của bạn ở turn này là
THIẾT KẾ và VIẾT TÀI LIỆU, không viết code, không tạo file source, không cài dependency.

## Đọc trước, theo đúng thứ tự

1. docs/SPECRESEARCH_LOOP-kim-chi-nam.md   — đặc tả nghiệp vụ, 16 chức năng bắt buộc, 10 deliverable,
                                             10 bước quy trình, NFR, kế hoạch đánh giá 3 arm.
                                             Đây là nguồn sự thật về YÊU CẦU.
2. docs/STACK.md                           — công nghệ đã chốt và danh sách cấm cài.
                                             Đây là RÀNG BUỘC, không phải gợi ý. Không đề xuất công
                                             nghệ nằm ngoài file này; muốn lệch thì phải nêu thành
                                             Open Question chứ không tự quyết.
3. docs/FEATURE_DESIGN_template.md         — mức độ chi tiết mong muốn của một design doc và những
                                             mục bắt buộc phải có. Học TINH THẦN của nó: viết cho
                                             người review ra quyết định, không viết hướng dẫn code.
4. docs/sample1.png … sample5.png          — 5 mockup UI. Đọc bằng mắt, trích ra hệ thống thị giác
                                             thật sự đang dùng: palette, nhịp bo góc, cách phân cột,
                                             cách hiển thị severity, stepper. Đề nói rõ KHÔNG cần làm
                                             y hệt mockup — lấy tinh thần, không photocopy.
5. .claude/rules/prompt-audit.md           — ràng buộc về thư mục prompts/ (deliverable #5).

Nếu hai tài liệu mâu thuẫn nhau: kim-chi-nam thắng về YÊU CẦU, STACK.md thắng về CÔNG NGHỆ.
Phát hiện mâu thuẫn nào thì liệt kê ra cuối tài liệu, đừng im lặng chọn một bên.

## Quyết định đã chốt — không mở lại, không đề xuất thay

- 2 project độc lập `frontend/` + `backend/` trong 1 repo, deploy riêng, KHÔNG có package dùng chung.
  Type dùng chung khai lại thủ công ở FE; contract giữa 2 bên đi qua enum mã lỗi.
- LLM: chỉ DeepSeek. Không thiết kế cho multi-provider.
- DB: Postgres qua DATABASE_URL (Neon). Không Docker, không docker-compose.
- Auth: JWT access + refresh, httpOnly cookie, FE proxy /api qua Next rewrites. Chi tiết ở STACK §11.
- Ngôn ngữ: UI tiếng Việt, nội dung spec 14 mục tiếng Anh. Chi tiết ở STACK §10.
- Cơ chế mới để ăn điểm (deliverable #8): CITATION VERIFIER rule-based. Đây là contribution chính,
  phải được thiết kế kỹ hơn mọi module khác và phải sinh ra số liệu đo được cho báo cáo đánh giá.

## Việc phải làm — 2 file

### File 1: docs/DESIGN_SYSTEM.md

Mục tiêu: một người khác cầm file này là dựng được UI nhất quán mà không cần hỏi lại, và một agent
cầm nó là biết chính xác dùng class nào cho trạng thái nào.

Phải có:

1. Nguyên tắc thiết kế — 3–5 dòng, rút từ mockup. Cái gì làm nên "chất" của giao diện này.
2. Bảng màu dưới dạng design token Tailwind v4 (`@theme` trong globals.css, KHÔNG tạo tailwind.config).
   Trích từ mockup, ghi mã hex thật.
3. Bảng ánh xạ trạng thái → màu, đây là phần quan trọng nhất:
   - 6 CardStatus: CONFIRMED / PROPOSED / MISSING / AMBIGUOUS / UNSUPPORTED / CONFLICT
   - 3 Severity: CRITICAL / MAJOR / MINOR
   - 3 SupportLabel: SUPPORTED / WEAK / UNSUPPORTED
   Ba nhóm này hiển thị cạnh nhau trên cùng màn hình. Phải phân biệt được bằng mắt, và phải phân biệt
   được cả về HÌNH DẠNG chứ không chỉ màu (badge đặc vs viền vs chấm), vì có màu trùng nghĩa giữa các
   nhóm. Giải thích lựa chọn, đừng chỉ liệt kê.
4. Typography scale + spacing scale + radius + border + shadow. Ít bậc thôi, mỗi bậc nói rõ dùng ở đâu.
5. Component inventory: liệt kê component cần dựng, đánh dấu cái nào lấy thẳng từ shadcn, cái nào
   phải tự viết, cái nào là shadcn sửa lại. Kèm 1 dòng mô tả trách nhiệm mỗi component.
   Tối thiểu phải phủ: top-nav, page-header, stepper, panel/card 3 cột, option A/B/C/Other,
   issue-table có cột trace judge, judge-panel, diff-view, card có màu theo trạng thái, hint box,
   trang login/register.
6. Layout & responsive: chốt breakpoint duy nhất và cách 3 cột co lại. Không làm mobile
   (STACK §5), nhưng phải nói rõ hành vi ở màn hình hẹp thay vì để vỡ.
7. Quy ước code: file nào giữ bảng ánh xạ enum→class, cấm viết màu inline ở component.

KHÔNG đưa vào file này: ERD, API, luồng backend.

### File 2: docs/ARCHITECTURE.md  (deliverable #3 của đề)

Mục tiêu: đủ để bắt đầu code mà không phải quyết thêm gì lớn, và đủ để nộp làm tài liệu kiến trúc.

Phải có:

1. Sơ đồ component + data flow, vẽ bằng mermaid. Ít nhất 2 sơ đồ:
   - tổng thể FE ↔ BE ↔ DB ↔ DeepSeek ↔ Semantic Scholar/OpenAlex/Crossref
   - luồng chi tiết của vòng Judge (5 judge song song → tổng hợp → user chọn → sửa spec → diff →
     verify lại), thể hiện rõ chỗ nào là điểm dừng chờ người dùng.
2. ERD đầy đủ, vẽ bằng mermaid erDiagram + bảng liệt kê field cho từng bảng (tên, kiểu, ràng buộc,
   ghi chú). Phải phủ được: quản lý user và sở hữu dữ liệu; 8 loại thẻ × 6 trạng thái; version + diff;
   decision history; 5 judge run có log riêng; issue có severity + trace về judge; nguồn và nhãn
   support giữa claim–nguồn; experiment plan; resource estimate; job chạy nền cho SSE.
   Nêu rõ lý do cho mỗi quyết định chuẩn hoá / phi chuẩn hoá đáng chú ý.
3. Ánh xạ 16 chức năng bắt buộc (kim-chi-nam §3) → module backend + màn hình frontend. Dạng bảng.
   Chức năng nào chưa có chỗ trong thiết kế thì ghi thẳng ra là còn thiếu.
4. Ánh xạ 10 bước quy trình của đề → 5 bước stepper trên UI (mockup chỉ có 5). Bước nào gộp vào
   bước nào, vì sao.
5. API surface: bảng endpoint (method, path, mô tả 1 dòng, trả về gì). Không viết OpenAPI đầy đủ,
   chỉ cần đủ để FE và BE thống nhất.
6. Thiết kế Citation Verifier — làm kỹ nhất, vì đây là contribution chính:
   thuật toán từng bước, đầu vào đầu ra, ngưỡng phân loại SUPPORTED/WEAK/UNSUPPORTED, chỗ nào dùng
   rule chỗ nào dùng LLM, và đo bằng metric gì để chứng minh nó có tác dụng.
7. Thiết kế cho eval 3 arm (B1 single-shot / B2 no-judge / SYS full): feature flag đặt ở đâu, dữ liệu
   eval đi vào đâu, "scripted user" hiện thực thế nào để 3 arm chạy công bằng.
8. Kế hoạch triển khai chia phase, mỗi phase có tiêu chí "coi là xong" quan sát được. Bám thứ tự ở
   kim-chi-nam §9 / STACK §9, đừng phát minh thứ tự mới.
9. Open Questions: những gì bạn phải đoán khi thiết kế, ghi rõ đoán gì và ai cần trả lời.

## Cách viết

- Tiếng Việt. Thuật ngữ kỹ thuật và tên enum/bảng/field giữ tiếng Anh.
- Theo tinh thần FEATURE_DESIGN_template.md: viết cho người review RA QUYẾT ĐỊNH. Mỗi lựa chọn
  đáng kể phải kèm lý do và phương án đã loại. Dòng nào chỉ có ích cho người gõ code chứ không giúp
  người review quyết — bỏ.
- Bảng và sơ đồ hơn văn xuôi. Không viết đoạn dài lặp lại nội dung bảng.
- Không bịa: cái gì đề bài không nói và bạn phải tự quyết thì đánh dấu rõ là quyết định của bạn.
- Không copy nguyên văn kim-chi-nam hay STACK.md vào. Tham chiếu tới chúng.

## Trước khi kết thúc, tự kiểm

- [ ] Đủ 16 chức năng bắt buộc, mỗi cái chỉ được ra đúng module + màn hình
- [ ] ERD phủ được cả 10 deliverable, đặc biệt #4 #6 #7 #8
- [ ] Không có công nghệ nào ngoài STACK.md
- [ ] 6 CardStatus + 3 Severity + 3 SupportLabel phân biệt được cả khi in trắng đen
- [ ] Mỗi bước quy trình có điểm dừng chờ người dùng — không bước nào tự động chốt
- [ ] Citation Verifier được thiết kế tới mức implement được ngay

## Kết quả
Thêm `docs/DESIGN_SYSTEM.md`: token Tailwind v4 (`@theme`, 8 họ màu theo vai trò), bảng ánh xạ
6 CardStatus / 3 Severity / 3 SupportLabel trong đó hình dạng mã hoá nhóm còn màu mã hoá giá trị nên
phân biệt được khi in trắng đen, 7 bậc chữ, inventory ~45 component chia shadcn/shadcn+/tự viết, một
breakpoint 1280px, quy ước cấm màu inline kèm lệnh grep kiểm.
Thêm `docs/ARCHITECTURE.md` (deliverable #3): 3 sơ đồ mermaid (tổng thể, vòng judge với 4 điểm dừng
chờ người dùng, máy trạng thái 5 bước), ERD ~20 bảng kèm field + lý do chuẩn hoá, ánh xạ 16 chức năng
và 10 deliverable, 10 bước đề → 5 bước stepper, 38 endpoint, thiết kế Citation Verifier 5 tầng
(rule → embedding local → LLM chỉ ở vùng xám) kèm ngưỡng và 7 metric, thiết kế 4 arm eval với flag ở
`Project.arm`, kế hoạch 8 phase, 15 open question, 8 mâu thuẫn tài liệu.
