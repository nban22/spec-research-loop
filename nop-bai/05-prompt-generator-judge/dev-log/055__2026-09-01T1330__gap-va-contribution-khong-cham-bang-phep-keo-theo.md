---
stt: 055
timestamp: 2026-09-01T13:30+07:00
model: claude-opus-5
scope:
  [
    backend/src/contracts/card.ts,
    backend/src/contracts/enums.ts,
    backend/src/verifier,
    frontend/src/lib,
    docs/evaluation_report.md,
    prompts/dev-log,
  ]
---

## Prompt

_Cùng prompt với dev-log [053](053__2026-09-01T0950__chua-kiem-chung-khong-phai-weak.md) —
người dùng yêu cầu tìm hiểu vì sao thẻ toàn nhãn WEAK rồi cải thiện. Sau khi vá lỗi đường
truyền ([054](054__2026-09-01T1031__retry-loi-duong-truyen-cua-llm.md)), lượt chạy full flow đi
được tới cuối và lộ ra nguyên nhân sâu hơn. Người dùng chọn phương án **tách tầng theo loại
thẻ** khi được hỏi._

## Kết quả

Full flow chạy thông 28/29 (một FAIL là do script quên body của `/estimate`, không phải lỗi sản
phẩm). Nhưng kết quả kiểm chứng cứ là **0 SUPPORTED / 1 WEAK / 11 UNSUPPORTED**, tất cả chốt ở
L4 với `NOT_ENTAILED`.

Thống kê trên **toàn bộ** cặp đã kiểm chứng của cả cơ sở dữ liệu:

| loại thẻ | n | SUPPORTED | WEAK | UNSUPPORTED |
| --- | ---: | ---: | ---: | ---: |
| `GAP` | 315 | **0 (0%)** | 15 | 300 |
| `CONTRIBUTION` | 130 | **0 (0%)** | 16 | 114 |
| `CLAIM` | 67 | 4 (6%) | 0 | 63 |

0/315 và 0/130 không phải xác suất thấp — đó là điều không thể xảy ra, và nguyên nhân là ngữ
nghĩa: `VERIFIABLE_CARD_TYPES` cho cả bốn loại thẻ đi qua L4, trong khi phép thử của L4 là *kéo
theo*. `GAP` khẳng định một **sự vắng mặt** ("chưa ai làm X") — không tóm tắt đơn lẻ nào kéo
theo được một phủ định phổ quát. `CONTRIBUTION` khẳng định **việc tác giả sắp làm** — một bài
báo cũ mà kéo theo được nó thì nghĩa là đóng góp không mới, tức `ENTAILS` đáng ra là tín hiệu
**xấu**, ngược hẳn bảng quyết định L5.

Vì 445/512 cặp thuộc hai loại đó, `unsupported_rate` bị đẩy về 1 bất kể ba cờ của làn A bật hay
tắt. Đây chính là thứ mà phụ lục A của báo cáo đang gọi là "nhiễu" — nhận xét đó **chưa đủ**, và
đã sửa lại trong `docs/evaluation_report.md` §A.3.1 kèm bảng trên. `conflict_detected = 0` là hệ
quả dây chuyền: mọi cặp cùng `UNSUPPORTED` thì không tồn tại cặp PRO–CON nào.

Sửa: `ENTAILMENT_CARD_TYPES = ['CLAIM', 'EVIDENCE']`. Chốt chặn đặt **sau L0–L2** chứ không phải
đầu hàm — trích dẫn của một gap vẫn phải có thật, DOI vẫn phải tra được, con số vẫn phải nằm
trong nguồn; chỉ bỏ đúng phép thử không áp dụng được. Cặp dừng sau L2 nhận `WEAK` + cờ mới
`CITATION_ONLY`, để không lẫn với "đã hỏi mô hình và bằng chứng yếu". Ba tầng (`enums.ts` ·
`frontend/types.ts` · `status-style.ts`) sửa cùng một commit. `layer-trace.ts` và `replay.ts`
đều có nhánh riêng cho cờ này.

Cổng xuất bản **tự sửa**, không phải đụng: nó lọc `support_label = 'UNSUPPORTED'` nên thôi chặn
vì những cặp không bao giờ thắng được, nhưng vẫn chặn khi nguồn của một `GAP` không tra ra. Vì
vậy `GATED_CARD_TYPES` giữ nguyên — nó còn được `credibility.service` dùng cho việc khác.

Hai chỗ test bắt được, cả hai đều là lỗ hổng **có sẵn** trong test cũ:

1. Fixture của `verifySpecVersion` thiếu `card.type`, nên `undefined` rơi vào nhánh mới mà suite
   vẫn xanh — test đó không khoá nhãn, chỉ khoá `unitsTotal`.
2. Fixture đó cũng thiếu `external_id`, nghĩa là **nó chưa bao giờ đi qua nổi L0**: mọi lượt đều
   dừng ở `SOURCE_NOT_FOUND`. Đã dựng lại fixture cho cặp CLAIM chạy thật tới đường tắt L3 và
   khoá nhãn `SUPPORTED`.

backend `jest 324/324 · lint 0 · build 0` · frontend `lint 0 · build 0 · vitest 89/89`
