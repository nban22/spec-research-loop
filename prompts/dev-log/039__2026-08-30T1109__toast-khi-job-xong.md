---
stt: 039
timestamp: 2026-08-30T11:09+07:00
model: claude-opus-5
scope:
  [
    frontend/src/lib/use-job.ts,
    frontend/src/lib/use-project.ts,
    frontend/src/lib/use-job.test.tsx,
  ]
---

## Prompt
i think we need a snackbar or something to indicate user that those columns are updated once it finishes

because right now we have to scroll to see those columns

## Kết quả
Tạo issue #28 rồi làm luôn trên branch `feat/job-done-toast`: job về `DONE` thì toast
`job.message` (backend đã viết sẵn câu kèm số lượng), `FAILED` thì toast lỗi ánh xạ từ
`error_code`. Đổi `useJob(onDone)` thành `onSettled(job)` và chống báo trùng bằng ref theo
`jobId`. Dùng đúng snackbar sẵn có — `Toaster` của `sonner` đã mount ở `app/layout.tsx`.
4 test mới; 39/39 component + 3/3 E2E xanh.
