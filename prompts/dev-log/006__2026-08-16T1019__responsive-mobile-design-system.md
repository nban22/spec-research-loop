---
stt: 006
timestamp: 2026-08-16T10:19+07:00
model: claude-opus-5
scope: [docs/DESIGN_SYSTEM.md, docs/ARCHITECTURE.md, docs/STACK.md, docs/SPECRESEARCH_LOOP-kim-chi-nam.md, docs/DESIGN_BRIEF_prompt.md]
---

## Prompt
@/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/DESIGN_SYSTEM.md hãy ngẫm các ảnh sample mà giáo viên cung cấp nữa @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample1.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample2.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample3.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample4.png @/d:/VSCODE/22127472/SPECRESEARCH_LOOP/docs/sample5.png  và hiểu rằng ứng dụng cần responsive cho mobile view alwway nhé, cả desktop và mobile view nhé, ngẫm rồi đi research pattern liên quan, để hiểu khi đưa về mobile cần view ntn cho hợp lý, đồng thời ở docs khác có bảo rule là ko cần responsive mobile là sai, bỏ luôn cho tôi nhé, thêm vào phải responsive nữa nhé

## Kết quả
Gỡ luật "không làm responsive mobile" khỏi `docs/STACK.md` §5 và `docs/SPECRESEARCH_LOOP-kim-chi-nam.md`
§4 (thay bằng ghi chú vì sao đổi), sửa `docs/DESIGN_BRIEF_prompt.md` để lần chạy sau không tái sinh luật cũ.
Viết lại `docs/DESIGN_SYSTEM.md` §6 thành "Layout & Responsive — desktop và mobile": 3 tầng bề rộng /
2 tiền tố (`md:` 768, `xl:` 1280, xoá breakpoint mặc định trong `@theme`), giữ 3 vai của 3 cột bằng
accordion + toàn bề rộng + `DecisionSheet` (bottom sheet 3 nấc, không đóng hẳn được), bảng related-work
và issue đổi sang card list, JudgePanel thành snap carousel, DiffView unified, vùng chạm 44×44,
checklist nghiệm thu ở 375/768/1440 và bảng phương án đã loại. Thêm nguyên tắc 6 (§1), cỡ chữ + lề
mobile (§4.1, §4.2, §4.2b), `--shadow-sheet` + breakpoint token (§2), 6 component mobile mới và hành vi
mobile của các component cũ (§5), luật mobile-first + grep chặn breakpoint lạ (§7.3, §7.2).
`docs/ARCHITECTURE.md`: responsive vào tiêu chí xong của phase 0 và phase 5, kèm ghi chú responsive
phải dựng từ phase 0 chứ không bọc lên sau.
