# 02 · Source code

> Sản phẩm bàn giao #2 · Trạng thái: **đủ**

Repo: <https://github.com/nban22/spec-research-loop> · nhánh `main`
Mã nguồn nộp kèm dưới dạng repo/zip, không chép vào thư mục này.

## Bố cục

```
backend/     NestJS 11 · Prisma · PostgreSQL     23.291 dòng TS (trừ code sinh tự động)
  src/       17 module nghiệp vụ
  eval/      bộ đánh giá 4 arm                    3.066 dòng
frontend/    Next.js 16 App Router · React 19    15.876 dòng TS/TSX
prompts/     18 prompt runtime + 83 dev-log
docs/        tài liệu kiến trúc, báo cáo          7.213 dòng
deploy/      cấu hình triển khai thật đang chạy
```

## Kiểm chất lượng

```bash
cd backend  && npm ci && npm test          # 38 suite · 445 test
cd frontend && npm ci && npm run test:component
cd frontend && npm run test:e2e            # 3 kịch bản Playwright
```

**Chạy lại 2026-09-03: backend 445/445 pass, 9,3 giây.** Bốn workflow trong `.github/workflows/`
chạy đúng những lệnh trên cho mọi pull request. Yêu cầu Node ≥ 20.9 (CI dùng 22).

## Hai luật do máy ép, không phải nhắc nhau nhớ

```bash
grep -rn "You are a" backend/src frontend/src       # prompt hardcode — phải rỗng
grep -rnE "#[0-9a-fA-F]{6}" frontend/src/components # màu thô — phải rỗng
```

Luật thứ nhất do hook `.claude/hooks/prompt-guard.mjs` enforce ở cuối mỗi lượt làm việc và **chặn**
nếu có chuỗi prompt lọt vào source — nhờ vậy [sản phẩm #5](../05-prompt-generator-judge/) không thể
trôi khỏi trạng thái đúng.

## Lịch sử phát triển

**150 commit · 33 pull request đã merge**, chạy theo ba làn song song chia theo **ranh giới sở hữu
file** chứ không theo tầng — làn A (bằng chứng & nguồn), làn B (phản biện & quyết định), làn C
(trực quan & chi phí). Bốn file dùng chung có luật *chỉ thêm dòng vào cuối*, nên ba nhánh chạy song
song mà gần như không conflict.

Ngoài code, [`../05-…/dev-log/`](../05-prompt-generator-judge/dev-log/) giữ **83 file** ghi nguyên
văn từng prompt đã dùng để xây dựng sản phẩm. Đề không đòi phần này.

## Quy ước đọc code

| Muốn biết | Đọc |
| --- | --- |
| Chọn công nghệ gì và **vì sao loại cái khác** | [STACK.md](../03-tai-lieu-kien-truc/STACK.md) |
| Chỗ hệ thống có thể vỡ | [SYSTEM_DESIGN_ANALYSIS.md](../03-tai-lieu-kien-truc/SYSTEM_DESIGN_ANALYSIS.md) |
| Quy tắc viết code | `backend/CLAUDE.md` · `frontend/CLAUDE.md` trong repo |
