# KỊCH BẢN TRÌNH BÀY — hai bản đồ

> Hai kịch bản độc lập, mỗi cái **6–8 phút**, dùng cho hai file mở bằng trình duyệt:
>
> | | File | Trả lời câu gì |
> | --- | --- | --- |
> | **Kịch bản 1** | `docs/product-flow-map.html` | *Sản phẩm chạy thế nào* |
> | **Kịch bản 2** | `docs/lane-c-map.html` | *Phần của em làm gì, vì sao thế, dựng bằng gì* |
>
> Trình bày **theo thứ tự đó**: người nghe phải biết sản phẩm là gì trước khi nghe phần đóng góp.
> Nếu chỉ có 8 phút cho cả hai thì chạy kịch bản 1 rút gọn (mục 1.3 → 1.5) rồi sang kịch bản 2.

**Chuẩn bị chung, làm trước khi vào phòng:**

- Mở sẵn **hai tab trình duyệt**, mỗi tab một file. Đừng mở file trong lúc trình bày — chuyển tab
  nhanh hơn và không lộ cửa sổ chọn file.
- Cửa sổ **rộng tối thiểu 1280px**: dưới mức đó panel bên phải chiếm chỗ và các ô bị dồn.
- Phóng trình duyệt lên **125%** nếu chiếu máy chiếu. Chữ trong hai file cỡ 11–13px, ở xa không đọc được.
- Biết trước **một câu chốt** cho mỗi mục — ghi ở cột cuối mỗi bảng dưới đây. Nói xong câu đó thì
  chuyển, đừng nói thêm.

---

# KỊCH BẢN 1 — `product-flow-map.html`

**Mục tiêu:** người nghe hiểu **sản phẩm làm gì và dữ liệu chảy đi đâu** trong 7 phút, không cần
đọc một dòng code nào.

**Câu mở đầu (nói trước khi click gì):**

> "Đây là bản đồ luồng của sản phẩm, dựng từ chính source code. Bốn tab đầu tương ứng bốn mục trên
> thanh điều hướng của app, tab cuối là bảng đối chiếu 16 chức năng bắt buộc của đề. Em click vào
> một ô là ra thiết kế kỹ thuật của ô đó."

## Tuyến đi

| # | Thời lượng | Click gì | Nói gì | Câu chốt |
| --- | --- | --- | --- | --- |
| 1.1 | 30s | Tab **Home** | Bốn vùng màu từ trên xuống: người dùng → màn hình → API → hạ tầng. Cùng một cách đọc ở mọi tab. | "Đọc từ trên xuống là đi từ người dùng tới database." |
| 1.2 | 45s | Node **Ô nhập ý tưởng** | Panel phải hiện mục đích, techstack, bảng liên quan, và **đường dẫn file thật**. | "Mỗi ô đều trỏ được về file thật — không có ô nào chỉ để trang trí." |
| 1.3 | 60s | Tab **Projects** → node **Stepper 5 bước** | Đây là tab nặng nhất. Wizard 5 bước là xương sống của sản phẩm. | "Năm bước, mỗi bước người dùng phải quyết một lần." |
| 1.4 | **90s** | Node **B3 · Contribution & Thí nghiệm** | Đọc phần `cases`. Nhấn vào ba trạng thái ước lượng: `OK` · `NOT_APPLICABLE` · `INVALID_PARAMS`. | "Không phải nghiên cứu nào cũng chạy trên GPU — một thử nghiệm lâm sàng thì không có model nào để ước lượng, và hệ thống nói thẳng điều đó thay vì bịa một con số." |
| 1.5 | **90s** | Node **B4 · Judge độc lập & Sửa spec** | 5 judge chấm **độc lập**, gộp thành nhóm vấn đề có mức độ và **trace về judge nào nêu**. Tối đa 3 vòng. | "Năm judge không thấy nhận xét của nhau — nếu thấy thì 'độc lập' chỉ là lời nói." |
| 1.6 | 60s | Node **B5 · Spec cuối & Xuất bản** | Còn claim `UNSUPPORTED` thì **chặn xuất bản thật**, không phải cảnh báo. | "Đây là chỗ khác nhau giữa gắn nhãn và chặn." |
| 1.7 | 45s | Node **DeepSeek** (vùng hạ tầng) | Một nhà cung cấp duy nhất, `temperature: 0`, mọi lời gọi ghi token vào DB. | "Mọi lời gọi model đều để lại hoá đơn trong database — đó là nền của phần đo chi phí." |
| 1.8 | **90s** | Tab **16 chức năng** | Bảng đối chiếu từng chức năng bắt buộc với nhóm component. **Chỉ vào một dòng `partial`** và đọc phần `gap`. | "Chỗ nào còn hở thì ghi thẳng ra là hở, kèm ước lượng thời gian vá." |

## Ba câu giảng viên hay hỏi ở kịch bản này

| Câu hỏi | Trả lời ngắn |
| --- | --- |
| *"Bản đồ này vẽ tay hay sinh tự động?"* | Vẽ tay, nhưng **mọi ô đều trỏ về file và số dòng thật** — mở ra kiểm được ngay. Nó là tài liệu, không phải sơ đồ minh hoạ. |
| *"Vì sao mỗi bước lại là job nền chứ không phải request thường?"* | Một lời gọi model mất 30–90 giây. Giữ HTTP mở suốt ngần ấy là mời timeout. Job nền + SSE cho phép người dùng đóng tab rồi quay lại. |
| *"16 chức năng có đủ hết chưa?"* | Chỉ thẳng vào tab đó. Có dòng `partial`, và mỗi dòng ghi rõ hở chỗ nào. **Đừng nói "gần đủ"** — chỉ vào bảng. |

## Ba điều đừng làm

1. **Đừng đọc panel bên phải thành lời.** Người nghe đọc nhanh hơn nghe. Click, im hai giây, rồi
   nói **một câu** về chỗ đáng chú ý nhất.
2. **Đừng click quá 8 ô.** Bản đồ có gần 40 node; click hết là mất mạch. Tám ô ở bảng trên là đủ
   kể hết một vòng.
3. **Đừng giấu tab "16 chức năng".** Đó là tab dễ bị hỏi nhất, chủ động mở trước thì tốt hơn bị hỏi.

---

# KỊCH BẢN 2 — `lane-c-map.html`

**Mục tiêu:** người nghe thấy **phần đóng góp cá nhân là gì, quyết định thiết kế nào đứng sau nó**,
và tin rằng đó là kỹ thuật chứ không phải tô vẽ.

**Câu mở đầu:**

> "Nhóm em chia ba làn theo ranh giới sở hữu file. Em phụ trách làn C — trực quan và chi phí. Ràng
> buộc cứng của làn này là **không ghi gì vào pipeline**, toàn bộ là đọc. Nhờ vậy nó không bao giờ
> chặn hai làn kia. Bản đồ này có bốn tab."

## Tuyến đi

| # | Thời lượng | Click gì | Nói gì | Câu chốt |
| --- | --- | --- | --- | --- |
| 2.1 | 45s | Tab **Tính năng**, chưa click ô nào | Chín phần việc, nhóm theo **bước của đề bài** chứ không theo thứ tự làm. | "Mỗi ô bám vào một mục *Khuyến khích sáng tạo* mà đề nêu." |
| 2.2 | **90s** | Node **#15 · Bản đồ claim–evidence kéo thả** (có nhãn *điểm nhấn demo*) | Đọc phần *Vì sao*, rồi **một** gạch đầu dòng ở *Quyết định thiết kế* — chọn dòng "nối trước, gỡ sau". | "Claim nào đang treo thì nhìn ra trong một giây — đó chính là chỗ verifier sẽ chặn xuất bản." |
| 2.3 | 60s | Node **#16 · Timeline · Similarity map · Citation graph** | Nhấn vào dòng quyết định về **MDS chứ không t-SNE**. | "t-SNE bóp méo đúng phần *vùng thưa* mà mình cần đọc, nên em chọn MDS: tất định và giữ khoảng cách toàn cục." |
| 2.4 | 60s | Node **#18 · Mô phỏng chi phí + đường Pareto** | Nhấn: **không chép công thức** sang frontend. | "Chép công thức thì hai bên lệch nhau ngay lần đầu ai sửa đơn giá, mà không ai phát hiện vì cả hai đều có vẻ đúng." |
| 2.5 | **90s** | Tab **Luồng dữ liệu**, click **AnalyticsModule** rồi **CardLinkModule** | Bốn cặp service **0 lệnh ghi**, và một ngoại lệ ghi duy nhất được tách hẳn ra module riêng. | "Ngoại lệ được để riêng để người sở hữu vùng đó duyệt trong vài phút, và không đồng ý thì revert đúng một module." |
| 2.6 | **90s** | Tab **Sáng tạo UI/UX**, click **Chấm Pareto trượt thay vì nhảy** | Đây là ô có khối *Trước / Sau* rõ nhất. | "Kéo một cái là 36 cấu hình đổi chỗ. Nhảy tức thì thì mất dấu điểm đang theo dõi — chuyển động ở đây **mang thông tin**, không phải để đẹp." |
| 2.7 | 60s | Cùng tab, click **Kéo thả không phải đường duy nhất** | Mỗi thao tác đều có nút thật có `aria-label`. | "Một tính năng chỉ dùng được bằng cách kéo là một tính năng không dùng được bằng bàn phím." |
| 2.8 | 45s | Tab **Techstack**, click **SVG viết tay — KHÔNG thư viện biểu đồ** | Đọc phần *Đáng lưu ý* — nói thẳng cái giá phải trả. | "Tự viết thì phải tự lo trục, tỉ lệ và khả năng tiếp cận. Em chấp nhận đánh đổi đó, và ghi nó ra." |

## Nếu còn thời gian — một ô để ghi điểm

Click node **Đối chiếu chéo mô hình** ở tab **Tính năng** (nhãn *không phải human validation*):

> "Chỗ này em muốn nói rõ: 30 nhãn trong bảng `HumanCheck` là do **một mô hình khác nhà cung cấp**
> chấm, không phải người. Em ghi nguồn gốc vào từng dòng và **giữ nguyên trạng thái ⚠️** cho hai sản
> phẩm bàn giao liên quan. Gọi nó là human validation thì mới là bịa bằng chứng."

Rồi thêm **một câu** về phát hiện đi kèm:

> "Và trong lúc làm thì phát hiện `calibrate.ts` **không thể** hiệu chỉnh ngưỡng từ dữ liệu đã lưu —
> vì ngưỡng chỉ quyết định *có gọi tầng L4 hay không*, mà replay lại chỉ chạy được với cặp *đã có*
> kết quả L4. Hai điều kiện loại trừ nhau."

## Bốn câu giảng viên hay hỏi ở kịch bản này

| Câu hỏi | Trả lời ngắn |
| --- | --- |
| *"Phần này có phải chỉ là giao diện không?"* | Không. Ba thứ tự viết là **thuật toán có test**: TF-IDF + MDS cho bản đồ chủ đề, độ thưa k-lân-cận, và bootstrap CI cho báo cáo chi phí. Mở tab Techstack, ô "Toán tự viết". |
| *"Vì sao không dùng thư viện biểu đồ cho nhanh?"* | Mọi hình ở đây đều lệch chuẩn của thư viện: vạch ngưỡng vẽ thẳng lên trục, hai tab dùng chung một hệ toạ độ, và nút SVG phải có ARIA. Kéo `d3` vào để rồi phải chống lại nó thì đắt hơn tự viết. |
| *"Làm sao chắc phần này không làm hỏng phần của bạn khác?"* | Ràng buộc **0 lệnh ghi**, kiểm được bằng `grep`. Ngoại lệ duy nhất nằm trong một module riêng, thêm đúng ba dòng vào file dùng chung. |
| *"Chi phí thật là bao nhiêu?"* | Đo trên 40 dự án: trung vị **~$0,02** một bản spec, nặng nhất **~$0,25**. Kèm caveat: đơn giá chưa xác nhận nguồn nên con số đúng về bậc độ lớn. Chi tiết ở `docs/vandap.md` §4.2. |

## Ba điều đừng làm

1. **Đừng nói "em làm giao diện".** Nói "em làm phần trực quan và đo chi phí" — và mở tab Techstack
   nếu bị hỏi thêm.
2. **Đừng đọc hết các gạch đầu dòng trong *Quyết định thiết kế*.** Mỗi ô chọn **đúng một** dòng,
   dòng nào có đánh đổi rõ nhất.
3. **Đừng né ô có nhãn cảnh báo.** Ô *"không phải human validation"* là ô ghi điểm chứ không phải ô
   giấu — nó cho thấy mình phân biệt được bằng chứng thật với bằng chứng bịa.

---

# Phụ lục — nếu bị hỏi ngoài kịch bản

| Hỏi về | Mở file nào |
| --- | --- |
| Kiến trúc, ERD, API | `docs/ARCHITECTURE.md` |
| Chọn công nghệ gì, **loại cái gì** | `docs/STACK.md` |
| Chỗ hệ thống có thể vỡ | `docs/SYSTEM_DESIGN_ANALYSIS.md` |
| Số đo, baseline, limitation | `docs/evaluation_report.md` |
| 12 câu vấn đáp đã soạn sẵn | `docs/vandap.md` |
| Còn thiếu gì để nộp | `docs/handover.md` |

**Một câu dùng được cho mọi câu hỏi chưa có số trả lời:**

> "Chỗ đó em chưa đo. Hạ tầng để đo thì chạy được rồi, còn thiếu một lần chạy máy — em ghi nó ở
> `docs/handover.md` §4 chứ không để trống."

Câu đó **thật**, và tốt hơn hẳn một câu đoán.
