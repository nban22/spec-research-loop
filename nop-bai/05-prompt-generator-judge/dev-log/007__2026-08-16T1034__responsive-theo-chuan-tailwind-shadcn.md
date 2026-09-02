---
stt: 007
timestamp: 2026-08-16T10:34+07:00
model: claude-opus-5
scope: [docs/DESIGN_SYSTEM.md, docs/STACK.md]
---

## Prompt
tại sao"Xoá hết breakpoint mặc định trong @theme (--breakpoint-*: initial), khai lại đúng 2 mốc md 768 / xl 1280. Đã verify cú pháp này với docs Tailwind v4. Hệ quả phải biết trước: shadcn sinh ra sm: → phải đổi sang md: ngay ở phase 0.
Vùng chạm 44×44 (Apple HIG 44pt, Material 48dp; WCAG 2.2 SC 2.5.8 chỉ đòi 24×24 nên đây là mức trên ngưỡng).
Thêm §6.10 checklist nghiệm thu ở 375/768/1440px"

tại sao? vẫn dùng styles hệ sinh thái tailwindcss và shadcn ui cho tôi chứ, giữ nguyên cả nhé, nếu cần thì refer tới, cứ đi mvp có responsive như thường nhé, theo standard của taildinwcss, shadcn ui cho tôi, tìm những docs defifne rằng ko có responsive, để sửa lại cho đúng cho tôi nhé

## Kết quả
Hoàn tác 2 chỗ tự phát minh, quay về chuẩn Tailwind + shadcn:
(1) Bỏ `--breakpoint-*: initial` trong `@theme` — giữ nguyên 5 mốc mặc định (sm 640 · md 768 · lg 1024 ·
xl 1280 · 2xl 1536), vì shadcn sinh class `sm:` trong dialog/sheet/drawer nên xoá là mọi component
thêm sau đều phải sửa tay. Bố cục 3 tầng vẫn chạy nguyên vẹn trên thang mặc định, chỉ dùng `md:` và
`xl:`. Gỡ luôn luật cấm `sm:`/`lg:`/`2xl:` và lệnh grep chặn breakpoint ở §7.2–§7.3, đổi thành quy
ước cho code của ta và luật không sửa `components/ui/`.
(2) Bỏ thang chiều cao nút 44×44 tự khai — dùng prop `size` của shadcn `Button` (`size="lg" w-full`
cho nút chính mobile); WCAG 24×24 / HIG 44 / Material 48 chỉ còn là ngưỡng để kiểm các nút tự viết.
Mốc nghiệm thu đổi 1440 → 1280 cho khớp breakpoint `xl`. Ghi 2 dòng vào bảng phương án đã loại (§6.11)
và 1 dòng vào bảng mâu thuẫn (§8). `docs/STACK.md` §5 viết lại mục Responsive theo đúng chuẩn hệ sinh thái.
Đã rà toàn repo: không còn tài liệu nào định nghĩa "không cần responsive".
