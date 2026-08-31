---
stt: 050
timestamp: 2026-08-31T22:32+07:00
model: claude-opus-5
scope:
  [
    backend/src/sources,
    backend/src/verifier,
    backend/src/conflict,
    backend/prisma/schema.prisma,
    backend/eval,
    frontend/src/components,
    frontend/src/app/(app)/projects/[id]/evidence,
    frontend/src/app/(app)/projects/[id]/label,
    frontend/src/lib,
    prompts/verifier_passage.md,
    prompts/conflict_pair.md,
    docs/evaluation_report.md,
  ]
---

## Prompt

dùng gh cli, pull các issue trong repo này, rồi xem các issues được gán cho tôi, nban22, rồi lên
plan kĩ để implements, về level decision thì ở mức mvp nhé, đảm bảo đủ output để trình bày cho
giảng viên về những gì có trong project là đủ, không overengineering, ko production ready

_(Ba câu hỏi làm rõ đã hỏi lại trước khi bắt tay: phạm vi → **cả 6 issue trên một nhánh
`a/evidence-lane`**; hạ tầng → Postgres + key DeepSeek + mạng đều chạy được, "cái nào không tự thêm
được thì hỏi chứ đừng dừng session"; mức MVP cho #2 → **chỉ arXiv, chỉ HTML, không parse PDF**.)_

## Kết quả

Làn A (#1–#6) trước turn này **trắng hoàn toàn** — không nhánh, không PR, trong khi làn B đã merge
#7/#12 và làn C đã merge #14/#16/#17/#19. Giờ cả sáu đã có code chạy được trên nhánh
`a/evidence-lane`, năm commit.

**#1 · chấm độ tin cậy nguồn** — hàm thuần 6 thành phần có trọng số (`credibility.ts` +
`venue-rank.ts`), quy về ba mức kèm **một câu tiếng Việt**; điểm số không bao giờ hiện ra. Chấm lại
ở cuối `searchAndStore`, bọc try/catch để hỏng chấm điểm không làm hỏng job tìm nguồn.
`GET /projects/:id/credibility` trả kèm danh sách thẻ **chỉ** dựa vào nguồn mức thấp — đó mới là
phần có giá trị. Test bắt được một lỗi thứ tự luật: "ACL 2024 Workshop" ban đầu ăn điểm ACL main
track, đã đẩy luật workshop lên đầu bảng.

**#3 · phát hiện nguồn mâu thuẫn** — chức năng bắt buộc §5 mà backend chưa bao giờ gán. Tầng luật
0 token, ba tín hiệu, chỉ tín hiệu **cực** đủ chắc để tự kết luận. Điểm quan trọng nhất: cực
**không** đọc thẳng `entailment`, vì cặp đi đường tắt L3 lưu `entailment: null` kèm nhãn SUPPORTED
— so ENTAILS với CONTRADICTS thì ca kinh điển "nguồn A ủng hộ, nguồn B phản bác" không bao giờ bị
bắt. Hai tín hiệu còn lại có cổng chặn dương tính giả (cùng tên metric · cùng chủ đề + chuẩn hoá
phủ định) và chỉ **đề cử** cặp cho tầng LLM, tối đa 10 cặp/lần chạy.

`conflict_with_card_id` chỉ ghi ở phạm vi `CROSS_CARD` — cùng một bài báo bị hai thẻ dùng ngược
cực. Tự trỏ về chính nó thì vô nghĩa và không truy vấn được.

Thứ tự trong `verifySpecVersion` là **dọn → lan → quét**, và nhờ vậy `propagateCardStatus` không
phải sửa một dòng nào. Kiểm trên DB thật: 3 dòng `Card` ở `CONFLICT`, 2 trong đó có
`conflict_with_card_id`, 0 lời gọi LLM; chạy lại 3 lượt cho cùng kết quả và `previous_status` vẫn
là `PROPOSED` — đúng con bug `AmbiguityFlag` từng dính.

**#2 · verifier đọc toàn văn** — làm thành **tầng leo thang L3b**, không thay thế abstract. Tắt cờ
⇒ hàm mới `return null` ngay dòng đầu, hành vi cũ không đổi một byte. Cái bẫy nguy hiểm nhất đã né
được: `clearlySupported` phải tính **trước** khi push cờ mới, nếu không `FULLTEXT_UNAVAILABLE` đầu
độc điều kiện đường tắt và âm thầm đẩy cặp SUPPORTED sạch xuống L4.

Kết quả thật trên "Attention Is All You Need": `WEAK sim=0.605` (abstract) → `SUPPORTED sim=0.782`
(toàn văn), 6 cặp còn lại y hệt hai lượt; câu chứng cứ kiểm được là nằm nguyên văn trong đoạn đã
lưu. Token LLM **không tăng** (5 đoạn ≈ một abstract).

**#5 · trang "vì sao nhãn này"** — `decidingLayer` suy ngược tầng đã quyết định từ dữ liệu đã lưu,
rẻ hơn hẳn việc thêm một bảng chỉ để chứa một chữ. Ngưỡng hiển thị đọc từ `VerifierRun.config` của
chính lần chạy đó; test khoá bằng một bộ ngưỡng khác mặc định nên hardcode hằng số là gãy ngay.

**#4 · hiệu chỉnh ngưỡng** — nối ba thứ vốn treo lơ lửng từ đầu dự án: bảng `HumanCheck` chưa ai
đọc/ghi, `eval/calibrate.ts` được `thresholds.ts` nhắc tên mà chưa từng tồn tại, hằng `GRID` là
export chết. `calibrate.ts` **không chạy lại verifier** — quét 27 bộ ngưỡng bằng `replayLabel` trên
dữ liệu đã lưu, và **in ra cột "không tái lập"** cho những cặp mà ngưỡng mới đòi L4 nhưng lần chạy
cũ chưa gọi. Smoke test 7 cặp (đã xoá sau): `replayLabel` cho đúng nhãn verifier thật đã gán trên
cả 7 — phép kiểm quan trọng nhất của cách tiếp cận này. Nó cũng lộ ra một lỗi: hai cờ toàn văn chưa
nằm trong danh sách cờ không-chặn, đã sửa kèm test.

**#6 · ablation** — 4 khoá metric mới viết ở `src/verifier/metrics.ts` (chỗ jest thấy được), gọi từ
**cả** `score.ts` lẫn `ablation-evidence.ts` nên hai bảng không nói lệch nhau. Script chạy 3 cấu
hình **xen kẽ theo ý tưởng**. Mục "Phụ lục A" trong `docs/evaluation_report.md` báo cả những chỗ
**không** cải thiện: độ phủ toàn văn thấp (chỉ arXiv có HTML mở, PDF bị cắt có chủ ý vì text bẩn
làm gãy chính tầng chống bịa trích dẫn), và `evidence_precision_human` **chưa có số** vì cần 30 cặp
gán tay chấm mù — việc tay không code thay được.

Ba thứ đáng ghi lại vì chúng đổi thiết kế:

1. **Prisma 7 CLI cần Node ≥ 20**, shell mặc định đang là 18.20.8 — dùng `nvm` v22.23.1 đã cài sẵn
   cho mọi lệnh prisma/next/eval, **không** đổi node mặc định của máy.
2. **Devdep test của frontend chưa từng được cài** trong checkout này (`vitest`, `msw`,
   `@playwright/test` khai trong `package.json` mà thiếu trong `node_modules`) — đã `npm install`.
3. Chạy `prettier` lên file frontend là **sai**: frontend chưa có cấu hình prettier
   (`frontend/CLAUDE.md` §8), nên nó nuốt toàn bộ nháy đơn thành nháy kép và đẻ ra 280 dòng diff
   rác. Đã revert và sửa tay.

backend `jest 299/299 · lint 0 · build 0` · frontend `lint 0 · build 0 · vitest 79/79` ·
grep màu thô rỗng · grep prompt hardcode rỗng
