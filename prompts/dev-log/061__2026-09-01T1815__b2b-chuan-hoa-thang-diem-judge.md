---
stt: 061
timestamp: 2026-09-01T18:15+07:00
model: claude-opus-5
scope:
  [
    backend/src/judge/severity-calibration.ts,
    backend/src/judge/issue-grouping.ts,
    backend/src/judge/judge.service.ts,
    backend/prisma/schema.prisma,
  ]
---

## Prompt

please continue working on the other 2 sub issues, we need this issue merged by tonight

## Kết quả

Hiện thực #44. Đổi thiết kế so với đề bài sau khi kiểm bằng số: **z-score là công cụ sai cho thang
3 bậc** — judge nặng tay dùng dải hẹp nên `sd` nhỏ, chia cho nó phóng đại độ lệch đúng bằng lượng
việc dịch tâm vừa trừ đi, nên z-score **không bao giờ hạ được** judge nặng tay (hướng duy nhất
quan trọng, vì `groupIssues` lấy `max_severity`). Đo trên J4 mean=2.75: z-score → CRITICAL (không
đổi), dịch tâm → MAJOR. Và thang 3 bậc còn có vách làm tròn xoá mọi hiệu chỉnh < 0,5 bậc — nên
`groupIssues` nhận **bậc liên tục** qua `rankOf`, `max_severity` vẫn lưu mức **thô** của người
thắng. `Issue.severity` không bị sửa: mức judge đã chấm là bằng chứng thô. Model
`JudgeCalibration` lưu thống kê đã dùng kèm `usable`/`reason` — dưới 5 vòng thì không hiệu chỉnh,
và điều đó đọc được trong DB. 492/492.
