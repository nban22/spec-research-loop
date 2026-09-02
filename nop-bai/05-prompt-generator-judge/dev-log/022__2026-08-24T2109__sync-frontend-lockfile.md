---
stt: 022
timestamp: 2026-08-24T21:09+07:00
model: antigravity
scope:
  - frontend/package-lock.json
---

## Prompt

> CI Frontend Tests
> fix(ui): improve IssueTable layout and add reason truncation modal #9
> npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.
> npm error Missing: yaml@2.9.0 from lock file

# 2026-08-24: Cập nhật file package-lock.json của Frontend để vượt qua CI

## Bối cảnh
Job "Playwright E2E Journeys" của GitHub Actions CI báo lỗi khi chạy lệnh `npm ci` trên thư mục `frontend` do `package.json` và `package-lock.json` không đồng bộ (báo thiếu gói `yaml@2.9.0`).

## Thay đổi
- Chạy `npm install` ở thư mục `frontend/` để tạo/cập nhật lại `package-lock.json` đảm bảo nó phản ánh chính xác cấu trúc dependency hiện tại.
- Lỗi này xuất phát từ một lần cập nhật dependency nào đó trước đây đã quên đồng bộ file lock. Giờ đã được sửa.
