# [Tên tính năng] — Design Doc

Status: Draft / Reviewed / Approved
Ngày: 
Liên quan: [link tới spec gốc / mục nào trong đề bài]

> File này để **người đọc quyết định "làm cái này có đúng không"**,
> không phải hướng dẫn "làm như thế nào". Chi tiết code, data model,
> luồng xử lý cụ thể để AI coding agent tự quyết khi implement.
> Nếu một dòng ở đây chỉ có ích cho coder chứ không giúp người
> review ra quyết định — bỏ dòng đó.

---

## 1. Vấn đề (Problem)

2-4 câu: đang thiếu gì, tại sao cần giải quyết bây giờ. Người đọc
chưa biết gì về context cũng phải hiểu được vấn đề sau đoạn này.

## 2. Mục tiêu (Goal)

Kết quả cụ thể, đo được, khi tính năng này xong.
Không viết "cải thiện trải nghiệm" — viết ra được điều gì thay đổi
mà người dùng/hệ thống *quan sát* được.

## 3. Không làm (Non-goals)

Ranh giới rõ ràng — phần này quyết định người review có đồng ý
"scope vừa đủ" hay không. Thiếu phần này, agent hoặc người làm
sau dễ tự mở rộng sang việc chưa được duyệt.

- Không làm A (lý do: ...)
- Không làm B (để dành phase sau)

## 4. Hướng tiếp cận (Approach)

Mô tả **ở mức ý tưởng** — cách giải quyết vấn đề, không phải cách
code. Đủ để người đọc hình dung được luồng, không cần biết field
nào, class nào, gọi API nào.

Ví dụ đúng mức: "Hệ thống chạy 5 lượt đánh giá độc lập trên cùng
một bản spec, mỗi lượt không thấy kết quả của lượt khác, sau đó
gộp lại thành một bảng vấn đề có phân loại mức độ."

Ví dụ sai mức (quá chi tiết, để dành cho coder): "Gọi API model X
với temperature=0, prompt template Y, lưu vào bảng JudgeRun..."

## 5. Phương án khác đã cân nhắc (Alternatives)

Chỉ ghi phương án bị loại + lý do loại, 1 dòng mỗi cái.
Mục đích: người review sau không hỏi lại "sao không làm kiểu X".

| Phương án | Vì sao không chọn |
|---|---|
| ... | ... |

## 6. Đánh đổi & Rủi ro (Trade-offs / Risks)

Cái gì được, cái gì mất khi chọn hướng này. Rủi ro đã biết trước —
không phải rủi ro kỹ thuật (bug, performance) mà là rủi ro **hướng
đi sai** (hiểu nhầm đề bài, giải quyết nhầm vấn đề, thiếu evidence).

## 6b. Ràng buộc riêng của feature này (nếu có)

Chỉ điền nếu feature này có ràng buộc **đặc thù**, sai là mất điểm/
hỏng hệ thống, và KHÔNG nằm trong NFR chung của dự án (đã có sẵn
ở tài liệu spec tổng — không copy lại NFR chung vào đây).

Ví dụ: "5 lượt đánh giá phải chạy độc lập, không thấy kết quả của
nhau" — đây là ràng buộc riêng của judge-loop, không áp dụng cho
feature khác nên không nằm trong NFR chung.

Nếu feature không có ràng buộc riêng nào ngoài NFR chung — xoá
mục này, đừng để trống.

## 7. Câu hỏi còn mở (Open Questions)

Điều cần người quyết trước khi coi design này là "chốt".
Ghi rõ ai cần trả lời.

- [ ] ... (chờ: giảng viên / bạn tự quyết)

## 8. Biết là xong khi nào (Definition of Done)

Danh sách ngắn, mỗi dòng là điều **quan sát được** — không viết
chi tiết test case, chỉ viết tiêu chí ở mức người ngoài nhìn vào
cũng đồng ý "vậy là xong".

- [ ] ...
- [ ] ...

## 9. Không đụng tới (Out of scope)

Phần hệ thống liên quan nhưng KHÔNG được thay đổi bởi tính năng này.
