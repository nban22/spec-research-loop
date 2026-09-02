# 04 · Dataset / tập use case thử nghiệm

> Sản phẩm bàn giao #4 · Trạng thái: **tập đầu vào đủ và đúng chuẩn** · tập nhãn kiểm chứng **chưa
> phải nhãn người** — nói rõ ở §2

Có **hai** dataset, khác mục đích. Trộn hai cái này là hiểu sai cả hai.

| | Dùng để | File |
| --- | --- | --- |
| **Tập 1 — đầu vào của hệ thống** | Mọi arm ăn cùng một thứ, để so sánh baseline có nghĩa | [`ideas.json`](ideas.json) |
| **Tập 2 — thước đo cho verifier** | Kiểm xem nhãn verifier gán có đúng không | [`label-sample-30-cap.json`](label-sample-30-cap.json) |

---

## 1. Tập đầu vào — 10 ý tưởng × 10 lĩnh vực

Nguồn gốc: `backend/eval/ideas.json` (bản chép ở đây là bản đóng băng).

| id | Lĩnh vực | Ý tưởng thô |
| --- | --- | --- |
| I01 | SE | Dùng LLM để tự động phát hiện lỗi logic trong code review |
| I02 | Medical | Hệ thống gợi ý phác đồ điều trị từ hồ sơ bệnh án |
| I03 | Transport | Graph neural network dự đoán ùn tắc giao thông ở TP.HCM |
| I04 | NLP | Cải thiện RAG cho tài liệu pháp luật tiếng Việt |
| I05 | Systems | Giảm chi phí inference của LLM bằng cách chọn model động |
| I06 | CV | Phát hiện sản phẩm lỗi trên dây chuyền bằng ảnh |
| I07 | Security | Dùng LLM để phát hiện email lừa đảo tiếng Việt |
| I08 | Edu | Tự động chấm bài luận của học sinh cấp 3 |
| I09 | Finance | Dự báo rủi ro tín dụng từ dữ liệu giao dịch |
| I10 | HCI | Đo mức độ tin tưởng của người dùng vào gợi ý của AI |

### Ba tính chất làm tập này dùng được

1. **Mơ hồ có chủ đích.** Mỗi câu thiếu ít nhất một trong ba thứ: *task · dữ liệu · tiêu chí đánh
   giá*. Đây chính là đầu vào mà hệ thống sinh ra để xử lý — nếu ý tưởng đã rõ thì câu hỏi làm rõ và
   thẻ `MISSING` không có gì để làm, và bài toán biến mất.
2. **`id` cố định.** `EvalRun` có ràng buộc `@@unique([batch_id, arm, idea_id])`, nên chạy lại cùng
   một batch không sinh bản ghi trùng — điều kiện để so sánh giữa các lần chạy.
3. **Trải 10 lĩnh vực khác nhau**, chống kết luận chỉ đúng cho một ngành. Ba trong số đó
   (I04, I07, và một phần I08) là bài toán **tiếng Việt**, nơi nguồn học thuật thưa hơn hẳn — cố ý
   để lộ ra điểm yếu của hệ thống chứ không né.

Mỗi ý tưởng dài đúng một câu, viết bằng giọng người dùng thật, không phải đề bài đã được làm sạch.

---

## 2. Tập nhãn kiểm chứng — 30 cặp (claim, nguồn)

File: [`label-sample-30-cap.json`](label-sample-30-cap.json) · rút mẫu với `seed = 42`, ngày
2026-09-01.

Mỗi mục là một cặp *(khẳng định trong spec, nguồn được gắn vào khẳng định đó)*, được chấm **mù** —
người/máy chấm chỉ thấy claim và abstract, không thấy nhãn verifier đã gán.

| Nhãn | Nghĩa | Số cặp |
| --- | --- | --- |
| `SUPPORTED` | Abstract có đoạn đỡ cho claim | 10 |
| `WEAK` | Liên quan nhưng không đủ đỡ | 11 |
| `UNSUPPORTED` | Không đỡ, hoặc mâu thuẫn | 9 |

Phân bố khá đều ba nhãn — quan trọng, vì một tập lệch hẳn về một nhãn thì accuracy cao mà vô nghĩa.

Chất lượng nhãn kiểm được qua trường `note`, mỗi dòng nói rõ **vì sao**, ví dụ:

> *"HITS là bài về Java, không có Swift và không có con số tỉ lệ biên dịch nào"*
>
> *"MÂU THUẪN: abstract nói hybrid tăng recall@50 12% so với BM25 và mức tăng giữ nguyên qua ba nhóm
> điều luật; claim nói hybrid không vượt được BM25 ở điều kiện matched"*

### Điều phải nói rõ về tập này

**30 nhãn hiện có do một mô hình khác nhà cung cấp chấm, không phải người.**

Đây là **đối chiếu chéo mô hình**, không phải *human validation*, và hai thứ đó không thay thế được
cho nhau. Nguồn gốc nhãn không bị giấu: công cụ [`label-sample.ts`](label-sample.ts) **bắt buộc** cờ
`--by=<ai chấm>` và ghi giá trị đó vào cột `HumanCheck.note` — một dòng nhãn không ghi ai sinh ra nó
thì không ghi được vào database.

Kết quả đối chiếu đã có (§C.12 của [báo cáo đánh giá](../08-bao-cao-danh-gia/evaluation_report.md)): khớp
**4/5 trên thẻ `CLAIM`**, và lần đối chiếu đó phát hiện `calibrate.ts` **không thể** hiệu chỉnh
ngưỡng `τ` từ dữ liệu đang lưu — một lỗi thật, tìm ra nhờ chạy thí nghiệm chứ không nhờ đọc lại code.

**Còn thiếu:** 20 cặp do người gán tay, để tính accuracy và Cohen's κ. Việc của người, khoảng một
buổi, và **không sửa được bằng thêm code**.

---

## 3. Chạy lại tập này

```bash
cd backend
npm run eval:run -- --arms=B1,B2,SYS,SYS_NO_VERIFY --limit=10   # ~2 giờ
npm run eval:label -- --by="<tên người chấm>"                    # xuất mẫu để gán nhãn
```

Thứ tự bắt buộc của cả quy trình đo nằm ở [07-baseline/README.md](../07-baseline/README.md).
