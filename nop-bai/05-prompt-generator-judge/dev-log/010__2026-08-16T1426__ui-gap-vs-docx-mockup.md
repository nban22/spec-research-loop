---
stt: 010
timestamp: 2026-08-16T14:26+07:00
model: claude-opus-5
scope: [docs/DESIGN_SYSTEM.md, docs/STACK.md, docs/SYSTEM_DESIGN_ANALYSIS.md]
---

## Prompt
đọc kĩ fix docx @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/SPECRESEARCH LOOP.docx  là yêu cầu gốc của đồ án cuối kì, trong có có 5 ảnh cho sample output ui/ux mà website nên có là @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample1.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample2.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample3.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample4.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample5.png  xem qua để lấy đó làm source of truth, rồi scan kĩ các docs @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/SYSTEM_DESIGN_ANALYSIS.md @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/STACK.md @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/DESIGN_SYSTEM.md  xem đã mô tả đúng chưa nhé, khi tôi dùng 3 tài liệu md đó để agent dev, thì ui/ux nhận được có đạt yêu cầu đồ án không nhé, nếu chưa thì sửa docs md cho tôi nhé (và yêu cầu về responsive cho smaller view buộc phải có nhé)

## Kết quả
Đối chiếu 5 mockup + `SPECRESEARCH LOOP.docx` với 3 file md, tìm được 10 lỗ hổng UI rồi sửa cả 3 file.
`DESIGN_SYSTEM.md`: thêm §3.8 (`ConfidenceLevel`), §5.4 (bản đồ màn hình desktop cho B1–B5 + 5 route
ngoài wizard), §5.5 (trạng thái chờ/rỗng/lỗi cho LLM 20–90s), 11 component thiếu (`IdeaInput`,
`CardBoard`, `SpecOutline`, `RoundTracker`, `DisagreementNote`, `ProjectList`…), 4 mâu thuẫn mới ở §8,
luật a11y ở §7.3, breakpoint ghi rõ `md`/`xl` ở §6.1.
`STACK.md`: thêm font + icon vào bảng §0, sửa §9 để UI/responsive thuộc phase 0–4 chứ không phải 5%
ở phase 5, thêm cảnh báo mockup không phủ hết yêu cầu đề.
`SYSTEM_DESIGN_ANALYSIS.md`: thêm tính năng #15 + khối phân tích S7 (vỏ wizard, 3 điểm nóng), siết
NFR-G-11, thêm NFR-G-13, 6 dòng mới ở §4.4.
