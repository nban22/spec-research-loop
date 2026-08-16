# DESIGN SYSTEM — SpecResearch Loop

Status: Draft — chờ verify
Ngày: 2026-08-16
Liên quan: `docs/SPECRESEARCH_LOOP-kim-chi-nam.md` (yêu cầu) · `docs/STACK.md` §5, §10 (ràng buộc công nghệ) · `docs/sample1..5.png` (mockup)

> **Mức mô tả của file này:** nói **cái gì** và **tại sao**, bằng ngôn ngữ tự nhiên.
> **Không** viết chuỗi class, khối CSS, hay số px — chuyện đó do kiến thức Tailwind CSS v4 và
> shadcn/ui quyết định lúc implement. Người code cầm file này để biết *ý đồ*, rồi tự chọn cách viết.
> Bảng ánh xạ enum → class là **code**, sống ở `frontend/src/lib/status-style.ts` (§7.1).
>
> Không chứa ERD, API hay luồng backend — những thứ đó ở `docs/ARCHITECTURE.md`.
>
> Mockup là **gợi ý**, đề nói rõ không cần làm y hệt (kim-chỉ-nam §1). Chỗ nào lệch mockup đều có lý
> do kèm theo, đánh dấu **[QĐ]** = quyết định của tôi, không phải yêu cầu của đề.

---

## 1. Nguyên tắc thiết kế

Rút từ 5 mockup, xếp theo thứ tự ưu tiên khi phải đánh đổi:

1. **Viền chứ không bóng.** Giao diện phẳng. Ranh giới do đường viền mảnh và nền trắng trên canvas
   xanh nhạt tạo ra. Chỉ card cấp một mới có bóng, và bóng gần như không thấy.
2. **Mỗi cột một vai, vai nào màu đó.** Trái = ngữ cảnh/input (xanh dương), giữa = nội dung hệ thống
   sinh ra (xanh lá/trung tính), phải = **chỗ người dùng phải quyết** (tím). Nhìn màu là biết đâu là
   nơi mình phải hành động — đây là cách UI thể hiện NFR *human-in-the-loop*.
3. **Trạng thái luôn có chữ, màu chỉ phụ trợ.** Không bao giờ mã hoá thông tin chỉ bằng màu. Mọi
   badge đều mang nhãn chữ và icon riêng, đọc được cả khi in trắng đen (§3.6).
4. **Đỏ/cam/vàng là tài sản riêng của "có vấn đề".** Ngoài `Severity` và các trạng thái hỏng, không
   dùng ba sắc này để trang trí. Thấy đỏ trên màn hình = chắc chắn có gì sai.
5. **Càng khẩn thì góc càng vuông.** Thẻ mềm nhất, hộp vừa, tag nhọn hơn, badge cảnh báo vuông nhất.
   Hình dạng là tín hiệu thứ hai bên cạnh màu.
6. **Ba vai sống sót ở mọi bề rộng.** Mockup là bản desktop, nhưng app phải chạy trên điện thoại. Ở
   mobile **không** dồn ba cột thành một dải cuộn dài — làm vậy là đẩy chỗ-phải-quyết xuống đáy trang
   và giết nguyên tắc 2. Ba vai được giữ bằng ba cơ chế khác nhau (§6.3).

---

## 2. Bảng màu và ý nghĩa

Token khai bằng `@theme` trong `globals.css` — Tailwind v4 không dùng `tailwind.config.*` (STACK §5).
Sắc cụ thể lấy từ **palette mặc định của Tailwind**; cột dưới ghi tên sắc để người implement tra
thẳng, không cần chép mã màu vào tài liệu.

**Tên token đặt theo vai trò, không theo màu.** Đọc "viền của vùng *decide*" thì biết ngay đó là vùng
chờ người dùng quyết; đọc "viền tím" thì không biết gì. Cách đặt tên này cũng làm luật cấm màu inline
(§7.2) kiểm tra được bằng grep.

| Họ token | Sắc Tailwind | Vai trò |
|---|---|---|
| `brand` | blue | Hành động chính, thứ do hệ thống sinh ra, link, nav đang chọn |
| `decide` | violet | **Chỗ người dùng phải quyết**: option A/B/C, bước hiện tại, trạng thái `CONFLICT` |
| `ok` | green | Đã chốt, đã có bằng chứng, bước đã qua |
| `warn` | amber | Cần làm rõ, chưa chắc chắn |
| `major` | orange | **Chỉ** `Severity = MAJOR` |
| `minor` | yellow | **Chỉ** `Severity = MINOR` |
| `danger` | red | Không có bằng chứng, lỗi chặn |
| `neutral` | slate | `MISSING`, chữ phụ, viền phụ |

Mỗi họ cần khoảng ba nấc: **rất nhạt** làm nền, **nhạt** làm viền, **đậm** làm chữ và nền đặc. Chọn
nấc nào là việc của người implement theo thang của Tailwind.

Ngoài ra có bộ trung tính riêng cho khung: nền trang (xanh rất nhạt), mặt card (trắng), nền chìm cho
header bảng và hộp lồng, viền mặc định, và bốn nấc chữ từ tiêu đề xuống placeholder.

**Vì sao đặt token riêng thay vì dùng thẳng tên sắc của Tailwind:** tên theo vai trò mang nghĩa, và
nó cho phép grep chặn màu thô lọt vào component. **Phương án đã loại:** dùng bộ biến của shadcn
(`--primary`, `--muted`, …) làm lớp token duy nhất — bộ đó chỉ khoảng tám khe, không đủ chỗ cho 12
giá trị enum ở §3 mà không phải nhồi thêm tên vô nghĩa. Ta vẫn giữ biến shadcn cho `components/ui/`
nhưng **trỏ chúng về token của mình**, để chỉ có một nguồn sự thật.

**Font — [QĐ]:** `Be Vietnam Pro`, nạp qua `next/font` (có sẵn trong Next.js, **không phải dependency
mới**, không vi phạm STACK §8). Lý do: mockup dùng một sans hình học bụng chữ tròn, và font này có
dấu tiếng Việt vẽ riêng chứ không ghép — UI toàn tiếng Việt (STACK §10) nên đây là tiêu chí quyết
định. Font mono dùng font hệ thống, chỉ xuất hiện ở `DiffView` và ô hiển thị DOI.

---

## 3. Ánh xạ trạng thái → hình dạng + màu

Phần quan trọng nhất của file. Ba nhóm enum này **hiển thị cạnh nhau trên cùng màn hình** — rõ nhất ở
bước 4: `SpecCard` mang `CardStatus`, bảng issue mang `Severity`, nguồn đính kèm mang `SupportLabel`.
Nếu chỉ phân biệt bằng màu thì người đọc không biết một chấm đỏ đang nói về thẻ, về issue, hay về
nguồn.

### 3.1 Nguyên tắc: hình dạng mã hoá NHÓM, màu mã hoá GIÁ TRỊ

| Nhóm | Vật thể | Nền | Viền | Kiểu chữ | Họ icon |
|---|---|---|---|---|---|
| **CardStatus** (6) | **Pill** bo tròn hoàn toàn | Tô rất nhạt | Mảnh (**đứt nét** riêng cho `MISSING`) | Sentence case, cỡ nhỏ | **Vòng tròn** |
| **Severity** (3) | **Khối đặc**, góc vuông nhất | Tô đậm | Không | CHỮ HOA, giãn nhẹ | **Đa giác** |
| **SupportLabel** (3) | **Tag rỗng ruột** | Trong suốt | Dày hơn bình thường | CHỮ HOA | **Khiên** |

Ba vật thể này khác nhau ở cả bốn chiều — độ tròn, độ đặc, độ dày viền, họ icon — nên phân biệt được
kể cả khi in mất màu, kể cả khi ba badge nằm sát nhau trên một dòng.

Severity là khối đặc, vuông nhất, chữ hoa — **cố ý nặng nhất** trong ba nhóm, vì nó là thứ duy nhất
người dùng bắt buộc phải xử lý trước khi chốt spec. Mockup 4 đã dùng đúng ngôn ngữ này, ta giữ.

### 3.2 CardStatus — 6 trạng thái

| Status | Nghĩa | Họ màu | Icon (lucide) | Vì sao màu này |
|---|---|---|---|---|
| `CONFIRMED` | User đã xác nhận | `ok` | `CircleCheck` | Đồng bộ với dấu ✓ xanh của stepper và hộp "Spec cuối cùng" ở mockup 4–5 |
| `PROPOSED` | Hệ thống đề xuất, chờ user | `brand` | `Circle` | Xanh dương = do hệ thống sinh ra. **Để nền trắng, không tô** — báo hiệu chưa được người dùng đóng dấu |
| `MISSING` | Mục bắt buộc còn trống | `neutral` | `CircleDashed` | Sự vắng mặt phải **lùi về sau**, không cạnh tranh chú ý với lỗi thật. Viền đứt nét là tín hiệu "chỗ trống", đọc được cả khi in |
| `AMBIGUOUS` | Hiểu được nhiều nghĩa | `warn` | `CircleHelp` | Hổ phách = "chưa chắc", đúng như hộp *Mức chắc chắn* ở mockup 1 |
| `UNSUPPORTED` | Không nguồn nào chống lưng | `danger` | `CircleSlash` | Đây là **lỗi chặn export** (verifier gate — ARCHITECTURE §6), phải đỏ |
| `CONFLICT` | Mâu thuẫn với thẻ khác | `decide` | `CircleAlert` | Tím = cần người dùng phân xử. Máy không tự chọn bên nào được, đúng tinh thần mockup 4 |

### 3.3 Severity — 3 mức

| Severity | Nền | Icon | Hình icon |
|---|---|---|---|
| `CRITICAL` | `danger` đặc, chữ trắng | `OctagonAlert` | Bát giác |
| `MAJOR` | `major` đặc, chữ trắng | `TriangleAlert` | Tam giác |
| `MINOR` | `minor` đặc, **chữ màu mực** | `Info` | Tròn |

Hai lớp bảo hiểm cho bản in trắng đen: độ đậm nền đi thành thang **tối → trung → sáng**, và icon là
ba hình học khác nhau.

**[QĐ] lệch mockup:** mockup 4 để badge `MINOR` chữ trắng trên nền vàng — tương phản không đọc nổi.
Ta đổi sang chữ màu mực trên nền vàng.

### 3.4 SupportLabel — 3 nhãn

| Label | Màu viền & chữ | Icon | Nghĩa |
|---|---|---|---|
| `SUPPORTED` | `ok` | `ShieldCheck` | Abstract của nguồn thật sự chống lưng claim |
| `WEAK` | `warn` | `ShieldAlert` | Có liên quan nhưng không đủ kết luận |
| `UNSUPPORTED` | `danger` | `ShieldX` | Nguồn không hỗ trợ, hoặc nguồn không tồn tại |

Tag **rỗng ruột** là cố ý: nó luôn nằm cạnh tên nguồn trong danh sách; tô nền đặc thì mỗi dòng nguồn
thành một vệt màu và bảng related-work sẽ loạn. Họ icon khiên đọc là "phán quyết về bằng chứng",
tách hẳn khỏi họ vòng tròn của `CardStatus`.

### 3.5 Ba chỗ màu trùng nhau — và vì sao cố ý

- `CONFIRMED` (xanh lá) trùng `SUPPORTED` (xanh lá) — cùng nghĩa "ổn rồi".
- `UNSUPPORTED` của `CardStatus` trùng `UNSUPPORTED` của `SupportLabel` (đỏ) — **cùng tên, cùng
  nghĩa**, chỉ khác cấp: một cái nói về cả thẻ, một cái nói về một cặp (claim, nguồn).
- `AMBIGUOUS` (hổ phách) trùng `WEAK` (hổ phách) — cùng nghĩa "chưa đủ chắc".

Giữ nguyên chủ ý: **màu giống nhau khi nghĩa giống nhau**, người dùng học một lần dùng được cả ba
nhóm. Việc phân biệt nhóm đã do hình dạng gánh (§3.1) — không cần bịa thêm sắc thứ chín chỉ để tránh
trùng.

### 3.6 Kiểm tra in trắng đen

| Tín hiệu | CardStatus | Severity | SupportLabel |
|---|---|---|---|
| Đường bao | Tròn hoàn toàn | Vuông nhất | Góc vừa, viền dày |
| Độ đặc của nền | Rất nhạt hoặc trong | **Đặc** | **Trong suốt** |
| Kiểu chữ | Sentence case | CHỮ HOA | CHỮ HOA |
| Icon phân biệt trong nhóm | 6 glyph vòng tròn khác nhau | 3 hình đa giác khác nhau | 3 glyph trong khiên |
| Nhãn chữ | Luôn hiện | Luôn hiện | Luôn hiện |

Không giá trị nào chỉ phân biệt được bằng màu. Đây cũng là lý do **cấm** rút gọn badge thành chấm
tròn không chữ ở bất kỳ đâu, kể cả trong ô bảng chật hay trên mobile.

### 3.7 Thẻ nội dung mang màu trạng thái thế nào

Thẻ **không** tô nền theo trạng thái — sáu nền màu cạnh nhau sẽ rối. Thay vào đó:

- Một **vạch màu mảnh chạy dọc cạnh trái** thẻ, lấy màu theo `CardStatus`.
- Một `StatusChip` ở góc phải phần đầu thẻ.
- Riêng `MISSING`: cả viền thẻ chuyển đứt nét, nền chìm xuống, chữ mờ đi — thẻ trông như một ô còn
  trống chờ điền, vì đó chính xác là nó.

### 3.8 `ConfidenceLevel` — nhóm thứ tư, và vì sao nó **không** được làm badge

Mockup 1 hiện *"Mức chắc chắn: Trung bình"* — đây là một giá trị enum thứ tư (`HIGH` · `MEDIUM` ·
`LOW`), nói về **mức tự tin của hệ thống khi diễn giải lại ý tưởng**, không nói về thẻ, issue hay
nguồn.

**Quyết định: không tạo component badge thứ tư.** Ba vật thể ở §3.1 đã dùng hết ba hình dạng phân biệt
được khi in trắng đen; thêm cái thứ tư là bắt người đọc học thêm một từ vựng nữa cho một giá trị chỉ
xuất hiện đúng một chỗ. Thay vào đó `ConfidenceLevel` render thành **một dòng trong `HintBox`**: nhãn
"Mức chắc chắn" + giá trị bằng chữ tiếng Việt, sắc thái của hộp lấy theo bảng dưới.

| Giá trị | Chữ hiển thị | Sắc thái `HintBox` | Vì sao |
|---|---|---|---|
| `HIGH` | Cao | ổn (`ok`) | Hệ thống hiểu chắc — không có việc gì phải làm |
| `MEDIUM` | Trung bình | cảnh báo (`warn`) | Đúng như mockup 1. Ngụ ý: nên đọc lại phần diễn giải |
| `LOW` | Thấp | cảnh báo (`warn`), **kèm câu nhắc sửa lại ý tưởng** | **Không dùng `danger`** — hệ thống hiểu chưa chắc không phải là *lỗi*, và đỏ là tài sản riêng của "có vấn đề" (§1 nguyên tắc 4) |

Ánh xạ này nằm cùng chỗ với ba nhóm kia (`status-style.ts`, §7.1) để không ai đi tìm ở nơi thứ hai,
nhưng nó **không** đi qua `StatusChip`/`SeverityBadge`/`SupportTag`.

---

## 4. Chữ, khoảng cách, hình khối

Mục này chốt **có bao nhiêu bậc và mỗi bậc dùng ở đâu**. Cỡ cụ thể lấy từ thang mặc định của Tailwind
lúc implement.

### 4.1 Bảy bậc chữ

| Bậc | Dùng ở đâu — và **chỉ** ở đó |
|---|---|
| Tiêu đề trang | H1 của `PageHeader`. Một trang đúng một cái |
| Tiêu đề phụ | Tiêu đề dialog/sheet, tiêu đề trang login/register |
| Tiêu đề khối | Tiêu đề `Panel` (mang màu accent của cột), tiêu đề `SpecCard` |
| Nội dung | Mặc định toàn app: nội dung thẻ, nhãn nút, nhãn option |
| Ô bảng | Ô của bảng ở desktop; trên mobile là nhãn trường trong card |
| Chú thích | `HintBox`, dòng "Ví dụ: …", nhãn `StatTile`, mô tả dưới `JudgeCard`, `StatusChip` |
| Badge | `SeverityBadge`, `SupportTag`, `JudgeTracePill` — nhỏ nhất, đậm, giãn chữ |

Không có bậc nào khác. Cần to hơn bậc đầu là dùng sai chỗ; nhỏ hơn bậc cuối là không đọc được.

Trên mobile **chỉ hai bậc đầu thu nhỏ**; năm bậc còn lại giữ nguyên, vì chúng đã ở ngưỡng đọc thoải
mái trên điện thoại, thu thêm là hại.

### 4.2 Khoảng cách

Một nhịp lề chủ đạo cho cả trang: padding của `Panel`, khoảng cách giữa các cột và lề trang đều dùng
chung nhịp đó. Bên trong `Panel` thì hẹp hơn một nấc; giữa icon và chữ hẹp nhất.

Trên mobile **rút cả trang về một nhịp lề duy nhất, hẹp hơn desktop một nấc**. Ở màn hình 375px, giữ
lề rộng như desktop là mất vài phần trăm bề rộng nội dung mà không đổi lại được gì.

### 4.3 Bo góc — thang giảm theo mức khẩn

Từ mềm nhất tới vuông nhất: `Panel`/`Dialog`/`AuthCard` → hộp lồng, nút, input, `StatTile`, icon tile
→ `SupportTag` và chip từ khoá → `SeverityBadge` (vuông nhất, khẩn nhất). Riêng `StatusChip`,
`JudgeTracePill`, avatar và node của `Stepper` thì bo tròn hoàn toàn.

### 4.4 Viền

Viền mảnh màu trung tính là mặc định của mọi `Panel`, hộp lồng và ô bảng. Ba biến thể:

- `Panel` mang accent thì dùng viền nhạt cùng họ màu với accent đó.
- **Option đang được chọn dùng viền dày gấp đôi** — độ dày là tín hiệu chọn, không phải màu.
- `MISSING` dùng viền đứt nét, cả ở chip lẫn ở thẻ.

Ngoài `SupportTag` (dày hơn một chút) và vạch dọc cạnh trái `SpecCard`, không dùng viền dày hơn hai
lần viền mặc định ở bất kỳ đâu.

### 4.5 Đổ bóng — ba nấc và một luật

| Nấc | Dùng cho |
|---|---|
| Bóng card | **Chỉ** card cấp một: `Panel`, `AuthCard`, `SummaryBar` |
| Bóng nổi | Phần tử nổi trên mặt phẳng: `Dialog`, `DropdownMenu`, `Popover`, `Tooltip` |
| Bóng sheet | **Chỉ** `DecisionSheet` và `MobileNavDrawer` — bóng **hắt lên**, báo hiệu lớp này neo vào cạnh màn hình chứ không trôi giữa trang |

**Luật:** hộp lồng bên trong `Panel` **không bao giờ** có bóng — chúng tách lớp bằng nền chìm hoặc
viền. Ở trạng thái nghỉ, desktop chỉ tồn tại bóng card; mobile có thêm đúng một bóng sheet ở đáy.

---

## 5. Component inventory

### 5.1 Lấy thẳng từ shadcn, không sửa

`button` · `input` · `textarea` · `label` · `checkbox` · `radio-group` · `select` · `separator` ·
`tooltip` · `dialog` · `dropdown-menu` · `popover` · `skeleton` · `sonner` (toast) · `scroll-area` ·
`avatar` · `tabs` · `accordion` · `progress` · `form` · `sheet` · `drawer`

Việc duy nhất phải làm sau khi `init`: trỏ bộ biến CSS của shadcn về token ở §2. **Không sửa gì khác
trong `components/ui/`** — sửa là mất khả năng chạy lại `npx shadcn add` mà không xung đột.

`sheet` và `drawer` thêm vào để phục vụ mobile (§6), đều có sẵn trong shadcn, không phải dependency
mới. `drawer` cho cảm giác kéo–thả tự nhiên nên dùng cho `DecisionSheet`; `sheet` đơn giản hơn nên
dùng cho `MobileNavDrawer` và `StepPickerSheet`.

Kích thước nút lấy từ prop `size` sẵn có của shadcn — **không tự khai thang chiều cao**. Nút hành
động chính trên mobile dùng cỡ lớn và chiếm trọn bề rộng.

### 5.2 shadcn có sửa

| Component | Sửa gì |
|---|---|
| `Card` | Thêm phần đầu có icon tile và màu accent |
| `Table` | Header dùng nền chìm, ô dùng bậc chữ "ô bảng", bỏ hiệu ứng đổi nền khi hover |
| `Badge` | Bỏ hết variant mặc định — badge trong app **chỉ** đi qua ba component ở §5.3 |
| `Alert` | Dùng làm nền cho `HintBox` (§5.3) |

### 5.3 Tự viết

**Khung trang**

| Component | Trách nhiệm |
|---|---|
| `TopNav` | Desktop: logo + 4 mục (Trang chủ · Dự án · Lịch sử phiên bản · Trợ giúp) + `UserMenu`, mục đang chọn có gạch chân. Mobile: nút ☰ + logo + avatar |
| `MobileNavDrawer` | **[mobile]** Sheet trượt từ trái: 4 mục nav, thông tin user, Đăng xuất |
| `UserMenu` | Avatar chữ cái đầu + tên + dropdown (Tài khoản, Đăng xuất). Trên mobile chỉ còn avatar, nội dung dồn vào `MobileNavDrawer` |
| `PageHeader` | Icon tile + H1 + phụ đề. Trên mobile icon nhỏ lại, phụ đề cắt bớt và bấm để mở rộng |
| `Stepper` | Desktop: 5 bước nằm ngang, dính ngay dưới `TopNav`. Bước đã qua = tròn đặc xanh lá có dấu ✓; bước hiện tại = tròn đặc xanh dương có số; bước chưa tới = tròn viền mờ |
| `StepperCompact` | **[mobile]** Dải gọn: 5 chấm + "Bước 3/5" + tên bước hiện tại; bấm mở `StepPickerSheet` |
| `StepPickerSheet` | **[mobile]** Sheet liệt kê 5 bước kèm trạng thái, cho nhảy về bước đã qua |
| `WizardShell` | Chọn bố cục theo bề rộng (§6.3): một cột + sheet · hai cột · ba cột. Nhận tham số cho biết bước này dùng tỉ lệ cột nào (§6.4) |
| `DecisionSheet` | **[mobile]** Bottom sheet ba nấc, giữ toàn bộ cột quyết định. **Không đóng hẳn được** — §6.3 |
| `SummaryBar` | Dải đáy "Tóm tắt sau vòng N" + `RoundTracker` + gợi ý bên phải. **Không** lặp lại `Stepper` toàn cục. Trên mobile xếp dọc và nằm trên vùng chừa cho `DecisionSheet` |
| `RoundTracker` | **Tiến độ *bên trong* một vòng**, nằm trong `SummaryBar`: `Sinh nội dung → Bạn xác nhận → Sang bước tiếp theo` (ở B4 dài hơn: `… → Judge kiểm lại → Hoàn tất`). Đây là thứ mockup 1–4 vẽ ở đáy trang mà **không phải** stepper 5 bước — xem §8 #2. Giữ nó là cách UI thể hiện chữ *Loop* trong tên đồ án và bước 10 của đề (sửa → verify lại → judge lại → xác nhận) |

**Hiển thị trạng thái — ba component độc quyền đọc bảng ánh xạ**

| Component | Trách nhiệm |
|---|---|
| `StatusChip` | `CardStatus` → pill (§3.2). Nơi **duy nhất** đọc ánh xạ của `CardStatus` |
| `SeverityBadge` | `Severity` → khối đặc (§3.3). Nơi **duy nhất** đọc ánh xạ của `Severity` |
| `SupportTag` | `SupportLabel` → tag rỗng (§3.4). Nơi **duy nhất** đọc ánh xạ của `SupportLabel` |

**Nội dung spec**

| Component | Trách nhiệm |
|---|---|
| `Panel` | Card cấp một có accent — viên gạch dựng nên mọi cột. Nhận accent, icon, tiêu đề, vùng thao tác |
| `IdeaInput` | **Ô nhập ý tưởng thô** (mockup 1 cột trái): vùng văn bản kiểu trích dẫn, nút bút chì để chuyển sang chế độ sửa, chip chủ đề bên dưới, nút chính "Phân tích ý tưởng" chiếm trọn bề rộng. Đây là điểm vào của toàn app — chức năng 1 |
| `TopicChipList` | Chip chủ đề do hệ thống suy ra từ ý tưởng (mockup 1: *Nghiên cứu AI*, *Prompt Optimization*…). **Chỉ đọc** — khác `KeywordChipInput` (sửa được, dùng ở B2). Hai thứ trông giống nhau nhưng khác quyền, đừng gộp |
| `ParaphraseCard` | **"Cách hệ thống đang hiểu ý tưởng"** (mockup 1 cột giữa): đoạn diễn giải trên nền `ok` rất nhạt, sửa tại chỗ được. Hiện thực chức năng 2. Dùng lại ở B4 cho hộp "Cách hệ thống đang hiểu lựa chọn" |
| `KeyProblemList` | **"Vấn đề chính"** (mockup 1): danh sách gạch đầu dòng, dùng họ `warn` — **không** dùng cam như mockup, xem §8 #5 |
| `CardBoard` | **Bảng thẻ phân rã: 8 loại × 6 trạng thái.** Nhóm `SpecCard` theo `type`, mỗi nhóm một tiêu đề nhỏ; lọc nhanh theo `CardStatus`. Hiện thực chức năng 3 + bước 2 của đề — xem §5.4, đây là khối **bắt buộc** mà mockup 1 không vẽ |
| `SpecCard` | Một thẻ trong 8 loại: vạch màu trạng thái cạnh trái + `StatusChip` + nội dung + nguồn đính kèm |
| `SpecOutline` | **"Spec tạm thời"** (mockup 4 cột trái): danh sách mục spec, mỗi mục = icon tile + số thứ tự + tên + mô tả một dòng, kèm nút "Xem chi tiết Spec tạm thời" mở `Dialog`/`Sheet`. Khác `SpecChecklist` ở chỗ nó là **mục lục để đọc**, không phải bảng kiểm đủ/thiếu |
| `HowItWorksList` | **"LLM tóm tắt cách làm"** (mockup 5 cột phải): 4 bước đánh số trong vòng tròn `ok`, giải thích hệ thống đã đi tới spec này bằng đường nào |
| `GapCard` | Thẻ gap với 4 câu hỏi bắt buộc của đề (đã làm được gì / còn hạn chế gì / vì sao hạn chế đó quan trọng / kiểm nghiệm bằng thí nghiệm nào) — thiếu ô nào thì ô đó mang trạng thái `MISSING` |
| `ClaimEvidenceCard` | Năm hàng: Claim · Baseline · Metric · Evidence · **Điều kiện bác bỏ** |
| `RelatedWorkTable` | Năm cột theo mockup 2 (Nghiên cứu · Đã làm gì · Loại feedback · Điểm còn thiếu · Nguồn). Trên mobile đổi sang `RelatedWorkCardList` |
| `RelatedWorkCardList` | **[mobile]** Mỗi paper một card: tên và năm làm tiêu đề, ba trường còn lại thành các hàng nhãn–giá trị, nguồn và `SupportTag` ở chân card |
| `SourceChip` | Bấm để mở thông tin nguồn: title, năm, venue, DOI, link ngoài, kèm `SupportTag` |
| `ExperimentPlanList` | TN1…TNn: mã thí nghiệm + tiêu đề + các gạch đầu dòng |
| `StatTileGrid` / `StatTile` | Lưới ô thông số (Model, Seed prompts, Candidates, Số vòng…) |
| `EstimateRows` | VRAM · Thời gian · Token · Chi phí, kèm cảnh báo khi vượt ngưỡng RTX 3090 |
| `SpecChecklist` | **14 mục** của spec kèm trạng thái đủ/thiếu (mockup 5 cột trái). Mockup chỉ vẽ 10 — lấy 14 theo đề bước 8, xem §8 #9 |

**Tương tác & quyết định**

| Component | Trách nhiệm |
|---|---|
| `OptionList` | A/B/C/**Other**. **Tự chèn option `Other` nếu API không trả về** — đây là NFR, không để phụ thuộc LLM. Chọn `Other` thì bắt buộc nhập lý do. **Hai biến thể** (§5.4): *gọn* — lưới ô ngắn tự xuống dòng, nhãn 2–4 chữ, dùng ở B1/B2; *xếp chồng* — mỗi option một hàng chiếm trọn bề rộng có dấu tích bên phải, dùng khi nhãn dài hoặc kèm mô tả, như B4. Chọn biến thể theo **độ dài nhãn**, không theo bước |
| `OptionHint` | Dòng "Ví dụ: …" với icon bóng đèn, cỡ chú thích, màu `decide` |
| `HintBox` | Hộp gợi ý/cảnh báo, bốn sắc thái: thông tin · ổn · cảnh báo · nguy hiểm. Dùng cho "Gợi ý", "Mức chắc chắn", cảnh báo vượt tài nguyên, banner kết thúc |
| `ConfirmDialog` | Cửa ngõ **bắt buộc** cho mọi thao tác tạo version mới hoặc chốt spec. Không có đường nào chốt spec mà không qua đây |

**Judge & issue**

| Component | Trách nhiệm |
|---|---|
| `JudgePanel` | Năm `JudgeCard` + dải chữ "Các Judge đánh giá độc lập, không xem nhận xét của nhau". Desktop: lưới 5 cột. Mobile: cuộn ngang có điểm dừng + chấm chỉ vị trí (§6.5) |
| `JudgeCard` | Tên judge + icon + **dãy chấm trạng thái** bám SSE (chờ / đang chạy / xong / lỗi) + mô tả một dòng |
| `IssueTable` | Cột: Severity · Vấn đề · Lý do · **Judge** · Thao tác. Mặc định sắp theo severity giảm dần. Trên mobile đổi sang `IssueCardList` |
| `IssueCardList` | **[mobile]** Mỗi issue một card: `SeverityBadge` và tiêu đề ở đầu, lý do ở giữa, `JudgeTracePill` ở chân. Giữ nguyên thứ tự sắp xếp |
| `JudgeTracePill` | Pill `J1`…`J5`. Nhiều judge cùng nêu thì hiện cả nhóm — đây là bằng chứng trace mà đề yêu cầu |
| `ConsensusMeter` | Thanh nhỏ "3/5 judge đồng ý" — nửa **đồng thuận** của chức năng 13. Mẫu số là **số judge chạy xong**, không phải hằng số 5; judge lỗi phải nói thẳng ra: *"3/4 judge đồng ý (J2 lỗi)"* (SYSTEM_DESIGN_ANALYSIS C3 · F.7) |
| `DisagreementNote` | Nửa **bất đồng** của chức năng 13 — phần mockup không vẽ và dễ quên nhất. Trên nhóm issue chỉ có 1 judge nêu trong khi các judge khác im lặng, hiện một dòng chú thích rằng đây là ý kiến thiểu số. Bất đồng là **thông tin cho người dùng cân nhắc**, không phải lỗi ⇒ dùng họ `neutral`, không dùng `warn` |

**Version & xuất bản**

| Component | Trách nhiệm |
|---|---|
| `DiffView` | Bọc `react-diff-viewer-continued` (STACK §0), ép màu về họ `ok`/`danger`, có header "v3 → v4". **Chuyển sang chế độ hợp nhất trên mobile** — diff hai cột ở 375px không đọc được |
| `VersionTimeline` | Danh sách version + chọn hai bản để so. Trên mobile chọn bằng sheet thay vì hai dropdown cạnh nhau |
| `DecisionLog` | Lịch sử quyết định: thời điểm · câu hỏi · option đã chọn · lý do — mục 14 của spec. Bảng ở desktop, card list ở mobile |
| `BeforeAfter` | Hai hàng Trước/Sau (mockup 5); dùng lại làm preview trước khi tạo version mới. Vốn đã xếp dọc nên không cần đổi |
| `ExportBar` | Xác nhận spec · Chỉnh sửa thêm · Xuất PDF · Xuất Markdown. Khi verifier còn chặn thì **disable kèm lý do hiển thị bằng chữ** — tooltip không dùng được trên cảm ứng (§6.7) |

**Tìm nguồn · Auth · trạng thái chung**

| Component | Trách nhiệm |
|---|---|
| `KeywordChipInput` | Ô nhập + chip từ khoá có nút xoá |
| `SourceFilterList` | Danh sách checkbox "Nguồn ưu tiên" (peer-reviewed, proceedings, …) |
| `AuthCard` | Khung hẹp giữa canvas cho login/register: logo, tiêu đề, form, link chuyển trang |
| `LoginForm` / `RegisterForm` | react-hook-form + zod; lỗi hiển thị bằng cách map `ErrorCode` sang tiếng Việt (§7.1) |
| `ProjectList` / `ProjectCard` | Màn `/projects`: mỗi dự án một card — tên (lấy từ ý tưởng thô, cắt bớt), bước đang đứng, số version, thời điểm sửa cuối, nút mở. Kèm `EmptyState` cho người dùng mới. Mockup không vẽ màn này nhưng nav có mục "Dự án" và ARCHITECTURE §3 đã cấp route |
| `JobProgress` | Bám SSE, dùng chung cho analyze / search / judge / verify — xem §5.5 |
| `EmptyState` / `ErrorState` | Trạng thái rỗng và lỗi dùng chung — xem §5.5 |

### 5.4 Bản đồ màn hình — component nào nằm ở cột nào (desktop)

§6.9 đã nói bố cục **mobile**. Mục này nói bố cục **desktop**, tức là thứ 5 mockup vẽ. Không có mục
này thì người code biết có những component gì nhưng không biết xếp chúng ở đâu.

Route và ánh xạ 16 chức năng → màn hình: `ARCHITECTURE.md` §3. Ở đây chỉ nói **bố cục**.

| Bước | Cột 1 — ngữ cảnh (`brand`) | Cột 2 — nội dung hệ thống sinh (`ok`/trung tính) | Cột 3 — quyết định (`decide`) | Preset (§6.4) |
|---|---|---|---|---|
| **B1** Nhập ý tưởng & Làm rõ | `IdeaInput` + `TopicChipList` + nút *Phân tích ý tưởng* | `ParaphraseCard` → `KeyProblemList` → `HintBox` mức chắc chắn (§3.8) → **`CardBoard`** | 2–3 câu hỏi làm rõ, mỗi câu một `OptionList` *gọn* + `OptionHint` | Cân bằng |
| **B2** Nghiên cứu & Research Gap | `Panel` từ khoá (`KeywordChipInput`) + `Panel` `SourceFilterList` | `RelatedWorkTable` | `GapCard` → `OptionList` *gọn* (hướng tập trung) + `OptionHint` | Giữa rộng |
| **B3** Contribution & Thí nghiệm | `Panel` contribution (danh sách đánh số) + `ClaimEvidenceCard` | `ExperimentPlanList` | `StatTileGrid` → `EstimateRows` → `HintBox` cảnh báo vượt tài nguyên → **`OptionList` duyệt kế hoạch** | Cân bằng |
| **B4** Judge độc lập & Sửa spec | `SpecOutline` + nút *Xem chi tiết Spec tạm thời* | `JudgePanel` → dải "Judge đánh giá độc lập, không xem nhận xét của nhau" → `IssueTable` + `ConsensusMeter` + `DisagreementNote` | `OptionList` *xếp chồng* → `ParaphraseCard` ("Cách hệ thống đang hiểu lựa chọn") → `BeforeAfter` → `HintBox` `ok` "Spec cuối cùng" → nút chốt qua `ConfirmDialog` | Giữa rộng |
| **B5** Spec cuối | `SpecChecklist` + `HintBox` tóm tắt đề tài | `HowItWorksList` → `BeforeAfter` ("Ví dụ dễ hiểu") → `ExportBar` | — (không có cột quyết định) | Hai cột |

Đáy mọi bước trừ B5: `SummaryBar` (gồm `RoundTracker`). B5 thay bằng `HintBox` `ok` chiếm trọn bề
rộng — banner "Spec đã sẵn sàng cho bước triển khai hoặc viết proposal" của mockup 5.

**Ba chỗ bản đồ này lệch mockup, đều có lý do — [QĐ]:**

1. **`CardBoard` ở B1 là khối bắt buộc mà mockup không vẽ.** Đề bước 2 và chức năng 3 đòi phân rã ý
   tưởng thành **8 loại thẻ mang 6 trạng thái**; mockup 1 chỉ vẽ phần diễn giải. Không có `CardBoard`
   thì sáu `CardStatus` ở §3.2 không bao giờ hiện ra trên màn hình, và cả §3 trở thành trang trí.
   Đặt nó **dưới** phần diễn giải trong cột giữa, cuộn dọc — không tách thành bước riêng, vì
   `ARCHITECTURE.md` §4 đã gộp bước 1–2 của đề vào B1.
2. **B3 có thêm một `OptionList` mà mockup 3 không có.** Mockup 3 để cột phải làm việc *thông báo*
   (kiểm tra khả thi), nên bước này không có chỗ nào để người dùng quyết. Điều đó vi phạm NFR-G-3
   *không bước nào tự chốt*. Thêm một khối quyết định gọn ở cuối cột phải: **duyệt kế hoạch · giảm
   quy mô theo đề xuất · Other**. Ba phương án này khớp thẳng với câu *"hệ thống có thể đề xuất giảm
   quy mô nếu vượt tài nguyên"* ở bước 7 của đề.
3. **`DisagreementNote` ở B4.** Chức năng 13 đòi tổng hợp **cả đồng thuận lẫn bất đồng**; mockup chỉ
   vẽ bảng issue. Không có nó thì nửa sau của chức năng 13 không demo được.

**Màn hình ngoài wizard** — đủ để phủ nav và 16 chức năng, không có màn nào thừa:

| Route | Nội dung | Bố cục |
|---|---|---|
| `/login`, `/register` | `AuthCard` + `LoginForm`/`RegisterForm` | Một cột hẹp giữa canvas ở mọi bề rộng |
| `/` (Trang chủ) | `IdeaInput` cỡ lớn để mở dự án mới + vài `ProjectCard` gần đây | Một cột, có bề rộng tối đa |
| `/projects` (Dự án) | `ProjectList` + `EmptyState` | Lưới card: 1 cột mobile · 2 tablet · 3 desktop |
| `/projects/:id/versions` (Lịch sử phiên bản) | `VersionTimeline` + `DiffView` + `DecisionLog` | Hai cột desktop (chọn bên trái, diff bên phải); mobile chọn bằng sheet rồi mới hiện diff |
| `/help` (Trợ giúp) | Trang tĩnh một màn | Một cột |

### 5.5 Trạng thái chờ, rỗng, lỗi — phần UX chiếm nhiều thời gian nhất của app

Đây **không** phải chi tiết phụ. Một lời gọi phân tích mất 20–40s, tìm nguồn 20–60s, chạy 5 judge tới
~90s (`SYSTEM_DESIGN_ANALYSIS.md` NFR-SRC-3, NFR-VER-3, NFR-JDG-3). Cộng lại, **người dùng nhìn màn
hình chờ nhiều hơn nhìn màn hình xong**. Nếu không chốt trước thì mỗi chỗ sẽ tự chế một kiểu chờ.

**Bốn kiểu chờ, chọn theo thời gian và theo việc có tiến độ thật hay không:**

| Kiểu | Dùng khi | Hình thức |
|---|---|---|
| Nút bận | Thao tác đồng bộ dưới ~1s: lưu quyết định, ước lượng tài nguyên | Nút chuyển trạng thái vô hiệu + vòng xoay nhỏ trong nút. Không skeleton, không overlay |
| Skeleton | Đọc dữ liệu đã có, dưới vài giây: mở lại một bước, tải danh sách dự án | `skeleton` của shadcn, **đúng hình khối của nội dung thật** — sai hình thì trang nhảy khi dữ liệu về |
| `JobProgress` có tiến độ | Job nền **biết được tổng số việc**: 5 judge, N unit verify | Thanh tiến độ + "3/5 judge xong" + dòng việc đang chạy. Ở B4, `JudgeCard` tự sáng lên theo SSE — dãy chấm của nó **là** tiến độ, không cần thêm thanh thứ hai |
| `JobProgress` không tiến độ | Job nền **một lời gọi, không chia nhỏ được**: paraphrase, sinh gap, sinh kế hoạch | Thanh chạy vô định + **câu mô tả hệ thống đang làm gì bằng tiếng Việt** + thời gian đã trôi. Không hiện phần trăm giả |

**Sáu luật, tất cả đều để tránh một màn hình đứng im không giải thích được:**

1. **Chờ nằm tại chỗ của nội dung**, không phải overlay toàn trang. Người dùng vẫn phải đọc được cột
   khác và vẫn cuộn được — đó là lý do mọi việc dài đều là job nền chứ không phải request đồng bộ.
2. **Luôn nói đang làm gì bằng chữ.** "Đang tìm nguồn trên Semantic Scholar…" chứ không phải một vòng
   xoay trống. Chuỗi này là **tiếng Việt**, kể cả khi kết quả sinh ra là tiếng Anh (STACK §10).
3. **Quá ~10 giây thì hiện thời gian đã trôi**; quá ~60 giây thì thêm một dòng trấn an rằng job vẫn
   chạy và có thể rời trang rồi quay lại. Đây là lời hứa mà `GET /jobs/:id` giữ được, không phải lời
   nói suông.
4. **Mất kết nối SSE không được trông giống job chết.** Hiện dải "mất kết nối, đang thử lại"; khi
   không nối lại được thì đổi sang nút *Tải lại trạng thái* gọi `GET /jobs/:id`. SSE là đường tăng
   tốc, không phải nguồn sự thật (`SYSTEM_DESIGN_ANALYSIS.md` S5 · F.8) — giao diện phải phản ánh
   đúng điều đó.
5. **Lỗi bộ phận hiện ra, không bị nuốt.** Ba lỗi bộ phận đã biết, mỗi lỗi một chỗ hiển thị:
   judge lỗi → `JudgeCard` đó mang trạng thái lỗi và `ConsensusMeter` đổi mẫu số; nguồn thiếu
   abstract → `SupportTag` `WEAK` kèm lý do; Crossref chết → cờ *DOI chưa kiểm được* trên `SourceChip`.
   Job vẫn `DONE` — người dùng thấy cái gì được, cái gì không.
6. **`ErrorState` luôn có một hành động.** Chạy lại, sửa đầu vào, hoặc quay về bước trước. Thông báo
   lấy từ `lib/error-code.ts` (§7.1), **không** in mã lỗi thô ra màn hình.

`EmptyState` cũng theo luật 6: mỗi trạng thái rỗng nói rõ vì sao rỗng và nút tiếp theo là gì — chưa
có dự án nào, chưa tìm nguồn lần nào, judge chưa chạy vòng nào.

---

## 6. Layout & Responsive — desktop **và** mobile

Mockup của giảng viên chỉ vẽ bản desktop, nên toàn bộ phần mobile dưới đây là **[QĐ]** — suy ra từ
mockup và pattern chuẩn, không sao chép.

### 6.1 Ba tầng bố cục, trên breakpoint mặc định của Tailwind

Dùng **nguyên** thang breakpoint của Tailwind, không thêm không bớt, không khai lại. Bố cục cấp trang
chỉ cần **hai trong năm mốc**: `md` (768px) và `xl` (1280px) — cùng hai mốc mà STACK §5 chốt, ghi tên
ra đây để hai tài liệu không trôi khỏi nhau. Ba mốc còn lại (`sm`, `lg`, `2xl`) vẫn tồn tại và shadcn
vẫn dùng chúng bên trong `components/ui/` — ta không đụng tới.

| Tầng | Bố cục |
|---|---|
| **Mobile** (dưới `md`) | **Một cột + bottom sheet** |
| **Tablet** (`md` → dưới `xl`) | **Hai cột**: ngữ cảnh và nội dung gộp bên trái, quyết định giữ bên phải và dính khi cuộn |
| **Desktop** (`xl` trở lên) | **Ba cột** đầy đủ, trong một container có bề rộng tối đa, căn giữa |

Viết **mobile-first** như Tailwind hướng dẫn: kiểu không tiền tố áp cho mọi bề rộng, tiền tố tablet
và desktop chỉ chồng thêm khi màn hình rộng ra.

Bề rộng để kiểm tra: **375px** (điện thoại phổ biến nhất), **768px** (đúng `md`), **1280px** (đúng
`xl`). Rộng hơn `xl` thì bố cục không đổi nữa nên không cần kiểm riêng.

### 6.2 Vấn đề thật của màn hình này

Không phải "thu nhỏ chữ lại là xong". Bốn thứ trong mockup thực sự vỡ ở bề rộng điện thoại:

| Khối | Vỡ vì sao |
|---|---|
| Lưới ba cột | Chia ba ở 375px thì mỗi cột chỉ còn hơn trăm pixel |
| `RelatedWorkTable` năm cột, mỗi ô 2–3 câu | Cột hẹp nhất còn vài chục pixel, chữ xuống dòng từng ký tự |
| `JudgePanel` năm thẻ nằm ngang | Mỗi thẻ còn khoảng bằng một ngón tay |
| Cột quyết định | Nếu xếp cuối trang thì **mọi thao tác đều phải cuộn hết trang mới tới** — đây mới là lỗi nặng nhất, vì nó phá NFR human-in-the-loop chứ không chỉ xấu |

### 6.3 Ba vai sống sót thế nào — quyết định quan trọng nhất của §6

Desktop có ba vai theo ba cột (§1 nguyên tắc 2). Ở mobile giữ ba vai bằng **ba cơ chế khác nhau**,
không phải bằng cách xếp chồng cả ba:

| Vai | Mobile | Vì sao |
|---|---|---|
| **Ngữ cảnh / input** | **Accordion**, mặc định **đóng** khi bước đó đã có dữ liệu | Là thứ đã xong, chỉ tra lại khi cần. Accordion hợp với nội dung cần tiết kiệm chỗ mà vẫn nằm tại chỗ |
| **Nội dung** | **Chiếm toàn bộ bề rộng**, cuộn dọc bình thường | Là thứ user tới để đọc |
| **Quyết định** | **`DecisionSheet` — bottom sheet neo đáy** | Là thứ user tới để **làm**. Bottom sheet là pattern chuẩn cho điều khiển quan trọng cần luôn trong tầm ngón cái |

```
MOBILE                        TABLET                       DESKTOP
┌────────────────────┐   ┌──────────┬──────────┐   ┌──────┬────────┬──────┐
│ ☰  SpecResearch  ⏺ │   │ TopNav (4 mục) + user│   │ TopNav (4 mục) + user│
├────────────────────┤   ├──────────┴──────────┤   ├──────┴────────┴──────┤
│ ●●●○○ Bước 3/5   ⌄ │   │ Stepper 5 bước ngang │   │ Stepper 5 bước ngang │
├────────────────────┤   ├──────────┬──────────┤   ├──────┬────────┬──────┤
│ [◈] 3. Contribution│   │ ngữ cảnh │          │   │      │        │      │
├────────────────────┤   ├──────────┤ quyết    │   │ ngữ  │ nội    │quyết │
│ ▸ Ngữ cảnh   (đóng)│   │          │ định     │   │ cảnh │ dung   │định  │
│ ┌────────────────┐ │   │ nội dung │ (dính)   │   │      │        │(dính)│
│ │ nội dung chính │ │   │          │          │   │      │        │      │
│ └────────────────┘ │   ├──────────┴──────────┤   ├──────┴────────┴──────┤
│ SummaryBar         │   │ SummaryBar           │   │ SummaryBar           │
│ ░ chừa chỗ cho sheet   └─────────────────────┘   └──────────────────────┘
├────────────────────┤
│ ⚠ Cần bạn quyết: 3 │ ← DecisionSheet, nấc "hé"
│ [  Xem & chọn    ] │   luôn hiện, không đóng được
└────────────────────┘
```

**`DecisionSheet` — ba nấc và một luật khác thường:**

| Nấc | Nội dung |
|---|---|
| **Hé** | Một dòng tóm tắt việc cần quyết + nút chính chiếm trọn bề rộng. Đây là chiều cao nghỉ |
| **Nửa** | Danh sách câu hỏi và `OptionList` đầy đủ |
| **Đầy** | Thêm `OptionHint`, phần "Cách hệ thống đang hiểu lựa chọn", ô nhập lý do khi chọn `Other` |

**Luật:** sheet **không bao giờ đóng hẳn** — kéo xuống hết chỉ về nấc hé. Đây là chỗ nó khác một
bottom sheet thông thường (vốn là overlay tuỳ chọn, dismiss được). Lý do nằm ở nghiệp vụ: hệ thống
này *không có bước nào tự chốt*, luôn tồn tại một việc chờ người dùng, nên chỗ chứa việc đó không
được biến mất. Khi bước hiện tại hết việc để quyết, nấc hé đổi sang trạng thái xong (nền xanh lá,
chữ "Đã đủ điều kiện sang bước sau") và nút chính thành "Sang bước tiếp theo".

Trang nội dung phải chừa lề dưới đủ để dòng cuối không bị nấc hé che.

### 6.4 Tỉ lệ cột

Mỗi bước dùng một trong ba tỉ lệ, khai thành preset trong `WizardShell`:

| Preset | Ý đồ | Dùng cho |
|---|---|---|
| Cân bằng | Ba cột xấp xỉ nhau, cột quyết định rộng hơn chút | Bước 1, Bước 3 |
| Giữa rộng | Cột giữa rộng hẳn để chứa bảng | Bước 2 (related work), Bước 4 (judge + issue) |
| Hai cột | Không có cột quyết định riêng | Bước 5 |

Bước 5 hành động bằng `ExportBar`, nên trên mobile `ExportBar` thành thanh dính đáy thay cho
`DecisionSheet`.

### 6.5 Bảng và khối nhiều cột → pattern nào

Ba pattern phổ biến cho bảng trên mobile: **cuộn ngang có khoá cột đầu** · **đổi mỗi hàng thành
card** · **priority+ (giấu cột phụ sau nút "thêm")**. Chọn theo tính chất dữ liệu, không theo thói
quen:

| Khối | Pattern | Vì sao |
|---|---|---|
| `RelatedWorkTable` (vài hàng, ô dài) | **Card** | Ít hàng và người dùng đọc **từng paper một**, không so ngang. Cuộn ngang ở đây bắt swipe qua lại mới ghép được nghĩa một hàng — tệ nhất trong ba lựa chọn |
| `IssueTable` | **Card**, giữ thứ tự theo severity | Cũng đọc từng cái. `SeverityBadge` đặt đầu card thì thang ưu tiên vẫn quét được bằng mắt |
| `DecisionLog` | **Card** + lọc theo bước | Cùng lý do; nếu về sau dài quá thì thêm bộ lọc, không quay lại bảng |
| `ClaimEvidenceCard` | **Nhãn trên, giá trị dưới** | Vốn đã là cặp nhãn–giá trị, chỉ đổi từ hai cột sang hai dòng |
| `StatTileGrid` | **Lưới hai cột** | Ô ngắn, hai cột ở 375px vẫn thoải mái |
| `JudgePanel` (năm thẻ **đồng dạng, ngắn**) | **Cuộn ngang có điểm dừng** + chấm chỉ vị trí | Ngoại lệ duy nhất được cuộn ngang. Năm judge là các phần tử **ngang hàng nhau**; xếp dọc thành năm thẻ cao là mất ẩn dụ "panel hội đồng", mà đó chính là điều đề bài nhấn mạnh |
| `DiffView` | **Hợp nhất** thay vì chia đôi | Hai cột ở 375px thì mỗi cột quá hẹp |

Card không phải "bảng bị bẻ". Mỗi card có cấu trúc riêng: trường định danh làm tiêu đề, thao tác làm
icon ở góc, phần còn lại là các hàng nhãn–giá trị.

### 6.6 Điều hướng ở mobile

| Thành phần | Quyết định | Vì sao |
|---|---|---|
| Bốn mục nav toàn cục | Nút ☰ mở `MobileNavDrawer` trượt từ trái | Tần suất thấp (chuyển dự án, xem lịch sử) — không đáng chiếm đáy màn hình |
| **Đáy màn hình** | Dành **riêng** cho `DecisionSheet` / `ExportBar` | Vùng ngón cái phải thuộc về hành động chính, không thuộc về điều hướng. Đây là lý do **không** làm bottom tab bar |
| Stepper | `StepperCompact` dính trên cùng: chấm + "Bước 3/5" + tên bước, bấm mở `StepPickerSheet` | Kết hợp *dots stepper* (thấy tổng quan) và *text stepper* (biết chính xác đang ở đâu) — hai biến thể chuẩn cho mobile. Năm nhãn tiếng Việt dài không thể nằm ngang ở 375px |

`TopNav` và thanh stepper đều thấp hơn một chút trên mobile; mọi phần tử dính khi cuộn phải neo dưới
tổng chiều cao của hai thanh đó.

### 6.7 Cảm ứng — ba luật không được quên

1. **Không có `:hover` mang thông tin.** Thứ gì chỉ hiện khi hover đều phải có đường thứ hai trên cảm
   ứng. Cụ thể: `SourceChip` mở thông tin nguồn khi **bấm**; lý do `ExportBar` bị disable hiển thị
   thành **chữ dưới nút**, không phải tooltip.
2. **Vùng chạm.** Nút của shadcn đã đủ lớn; chỗ phải tự kiểm là những thứ ta tự viết — nút xoá trên
   chip từ khoá, icon nguồn, nút mở accordion, chấm của `StepperCompact`. Nới vùng bấm bằng padding
   hoặc lớp phủ trong suốt, **không** bằng cách phóng to icon. Ngưỡng tham chiếu khi kiểm: WCAG 2.2
   SC 2.5.8 (AA) đòi tối thiểu 24×24 CSS px; Apple HIG khuyến nghị 44pt, Material 48dp.
3. **Vùng an toàn của iPhone.** `DecisionSheet` và `ExportBar` phải trừ safe-area đáy, nếu không nút
   chính nằm dưới thanh gesture.

### 6.8 Container query — dùng đúng một chỗ

Tailwind v4 có container query sẵn trong lõi, không cần plugin. Dùng **chỉ** cho component xuất hiện
ở nhiều bề rộng khác nhau trong cùng một tầng màn hình: `StatTileGrid`, `OptionList`,
`ClaimEvidenceCard` — chúng nằm trong cột hẹp ở desktop nhưng chiếm toàn bề rộng ở mobile và trong
`DecisionSheet`.

Mọi thứ khác dùng breakpoint thường. **Không** dùng container query thay cho breakpoint ở tầng bố cục
trang — hai hệ song song sẽ khiến không ai đoán được cái nào thắng.

### 6.9 Từng bước wizard trên mobile

| Bước | Ngữ cảnh → accordion | Nội dung → toàn bề rộng | Quyết định → `DecisionSheet` |
|---|---|---|---|
| **B1** Nhập ý tưởng | *Không thu gọn* — `IdeaInput` là hành động chính của bước này | `ParaphraseCard` → `KeyProblemList` → mức chắc chắn → **`CardBoard` một cột, mặc định lọc theo trạng thái cần chú ý** | Ba câu hỏi làm rõ, mỗi câu một khối trong sheet |
| **B2** Nghiên cứu | Từ khoá + "Nguồn ưu tiên" (đóng) | `RelatedWorkCardList` | Research gap + lựa chọn hướng |
| **B3** Contribution | Contribution + `ClaimEvidenceCard` (mở) | `ExperimentPlanList` → `StatTileGrid` → `EstimateRows` → cảnh báo vượt tài nguyên | Duyệt kế hoạch: duyệt · giảm quy mô · Other (§5.4 #2) |
| **B4** Judge | `SpecOutline` (đóng) | `JudgePanel` cuộn ngang → dải "judge độc lập" → `IssueCardList` + `ConsensusMeter` | `OptionList` *xếp chồng* → `BeforeAfter` → nút xác nhận |
| **B5** Spec cuối | — | `SpecChecklist` → `HowItWorksList` → `BeforeAfter` | Không có sheet; `ExportBar` dính đáy |

**`CardBoard` ở mobile.** Tám nhóm × sáu trạng thái là khối dày nhất của B1. Ở 375px xếp một cột, mỗi
loại thẻ một `accordion`; các nhóm còn thẻ ở trạng thái `MISSING`/`AMBIGUOUS`/`CONFLICT`/`UNSUPPORTED`
**mở sẵn**, nhóm đã `CONFIRMED` hết thì đóng. Nguyên tắc quen thuộc của §6.9: mở hay đóng tuỳ chỗ đó
còn việc hay không, không tuỳ vị trí ở desktop.

Nguyên tắc chung: **accordion mở hay đóng tuỳ bước đó user còn phải nhập gì không**, không theo vị
trí cột ở desktop.

### 6.10 Nghiệm thu responsive

Coi là xong khi ở cả ba bề rộng kiểm tra (§6.1):

- [ ] Không có cuộn ngang ở cấp trang — trừ hai vùng cố ý: `JudgePanel` và khối code trong `DiffView`
- [ ] Ở mọi bước, thao tác chính chạm tới được **không cần cuộn**
- [ ] Các nút tự viết không nhỏ hơn ngưỡng ở §6.7
- [ ] Không thông tin nào **chỉ** xuất hiện khi hover
- [ ] Sáu `CardStatus` + ba `Severity` + ba `SupportLabel` vẫn hiện đủ nhãn chữ ở 375px — không rút
      gọn badge thành chấm (§3.6)
- [ ] Xoay ngang điện thoại không vỡ
- [ ] `CardBoard` đọc được ở 375px: tám loại thẻ đều tới được, thẻ dài không tràn ngang (§6.9)
- [ ] Mọi trạng thái chờ ở §5.5 kiểm ở 375px — thanh tiến độ, dòng mô tả và thời gian đã trôi không
      bị `DecisionSheet` che
- [ ] Đi được **trọn** năm bước ở 375px bằng bàn phím ngoài, không dùng chuột (NFR-G-11)
- [ ] Bảng dài (`RelatedWorkTable`, `IssueTable`, `DecisionLog`) đã đổi sang card list, không còn
      bảng thật ở dưới mốc `md`

### 6.11 Phương án đã cân nhắc và loại

| Phương án | Vì sao loại |
|---|---|
| **Không làm mobile**, khoá bề rộng tối thiểu rồi cho cuộn ngang | Phương án ở một bản trước của file này. Đã bỏ: app phải dùng được trên điện thoại |
| **Xoá bớt breakpoint mặc định** rồi khai lại hai mốc | Cũng là một bản trước. Đã bỏ vì nó chống lại shadcn — `dialog`, `sheet`, `drawer` đều sinh ra kiểu ở mốc nhỏ; xoá mốc đó là mọi component thêm sau đều phải sửa tay. Thang mặc định vốn đã vừa khít ba tầng bố cục |
| **Tự khai thang chiều cao nút** để ép vùng chạm | Ghi đè `Button` của shadcn là tự ôm việc bảo trì qua mỗi version. Dùng prop `size` sẵn có |
| Xếp thẳng ba cột thành ba khối dọc | Đẩy cột quyết định xuống đáy trang → mọi thao tác phải cuộn hết trang. Phá NFR human-in-the-loop, không chỉ xấu |
| Tabs / segmented control để đổi giữa ba cột | Giấu mất nội dung khi đang quyết định — mà quyết định lại **cần** nhìn nội dung. Tabs hợp với ba khối độc lập; ba cột này không độc lập |
| Bottom tab bar cho bốn mục nav | Chiếm vùng ngón cái cho việc tần suất thấp, đẩy hành động chính lên trên |
| Cuộn ngang cho `RelatedWorkTable` | Bắt swipe qua lại mới ghép được nghĩa một hàng, trong khi mỗi hàng chỉ cần đọc một lần |
| `DecisionSheet` là modal đóng được | Đóng rồi thì không còn dấu hiệu nào cho biết đang có việc chờ quyết |
| Thêm thư viện UI riêng cho mobile | Ngoài STACK §8; `sheet` + `drawer` + `accordion` của shadcn đã đủ |

**Vị trí Stepper — [QĐ] lệch mockup.** Mockup 1–4 nhét stepper vào dải "Tóm tắt sau vòng N" ở đáy
trang; mockup 5 đặt nó thành thanh ngang dưới nav. Chọn phương án của mockup 5 và áp cho **cả năm
bước**: stepper là điều hướng, phải luôn nhìn thấy được. Trên mobile lý do còn mạnh hơn — đáy màn
hình đã thuộc về `DecisionSheet`.

**Nguồn tham khảo pattern:**
[NN/g — Bottom Sheets](https://www.nngroup.com/articles/bottom-sheet/) ·
[Material Design — Bottom sheets](https://m2.material.io/components/sheets-bottom) ·
[Mobbin — Accordion](https://mobbin.com/glossary/accordion) ·
[UX Patterns for Developers — Data Table](https://uxpatterns.dev/patterns/data-display/table) ·
[Responsive Design for Large Tables](https://medium.com/@kolbenkom/responsive-design-for-large-tables-how-to-fit-complex-data-on-a-mobile-screen-71df0c8ab90c) ·
[Lollypop — Stepper UI Design](https://lollypop.design/blog/2026/february/beyond-the-progress-bar-the-art-of-stepper-ui-design/) ·
[WCAG 2.2 SC 2.5.8 Target Size](https://wcag22aa.org/new-criteria/target-size/) ·
[Tailwind CSS — Responsive design](https://tailwindcss.com/docs/responsive-design)

---

## 7. Quy ước code

Mục này nói về **tổ chức file**, không nói về styles — nên nó vẫn cụ thể.

### 7.1 Một nơi duy nhất giữ ánh xạ enum → class

```
frontend/src/lib/types.ts         3 union type khai lại tay từ backend/src/contracts/ (STACK §3.1)
frontend/src/lib/status-style.ts  ánh xạ CardStatus / Severity / SupportLabel / ConfidenceLevel → class
frontend/src/lib/error-code.ts    ErrorCode → thông báo tiếng Việt
```

`status-style.ts` là **nơi §3 biến thành code**. Khai kiểu sao cho thiếu một giá trị enum là **lỗi
TypeScript lúc build**, không phải badge trắng lúc chạy — đó là lý do dùng kiểu ánh xạ đầy đủ theo
union thay vì object thường. Mỗi mục chứa đúng ba thứ: nhãn hiển thị, icon, chuỗi class. Không chứa
logic.

Ba component `StatusChip` / `SeverityBadge` / `SupportTag` là nơi **duy nhất** được đọc file này.

### 7.2 Cấm màu inline ở component

- Cấm style inline và mã màu viết thẳng trong `.tsx`.
- Cấm class màu thô của Tailwind trong `app/` và `components/` — **trừ** `components/ui/` (shadcn
  sinh ra) và `lib/status-style.ts`.
- Muốn thể hiện trạng thái thì render `StatusChip` / `SeverityBadge` / `SupportTag`, không tự nối
  chuỗi class.

Kiểm bằng lệnh, cùng kiểu với grep chống hardcode prompt ở STACK §1:

```bash
grep -rnE "(bg|text|border|ring|from|to)-(red|green|blue|yellow|orange|purple|violet|amber|slate|gray|zinc|emerald|sky)-[0-9]{2,3}" \
  frontend/src/app frontend/src/components --include=*.tsx | grep -v "frontend/src/components/ui/"
# → phải rỗng
```

### 7.3 Ràng buộc còn lại

| Luật | Lý do |
|---|---|
| Viết **mobile-first**: kiểu không tiền tố là mobile, tiền tố tablet/desktop chồng thêm khi rộng ra | Cách Tailwind được thiết kế để dùng |
| Bố cục cấp trang chỉ dùng hai mốc tablet và desktop | §6.1. Các mốc còn lại vẫn tồn tại cho shadcn — đây là quy ước cho code của ta, **không** phải lệnh cấm toàn repo |
| **Không sửa file trong `components/ui/`** ngoài việc trỏ biến CSS về token | Sửa là mất khả năng chạy lại `npx shadcn add` mà không xung đột |
| Kích thước nút lấy từ prop `size` của shadcn, không tự khai chiều cao | §5.1 |
| Container query chỉ dùng cho ba component ở §6.8 | Hai hệ responsive song song ở tầng trang thì không đoán được cái nào thắng |
| Không đặt thông tin **chỉ** trong `:hover` hoặc `title` | §6.7 — cảm ứng không có hover |
| Icon dùng `lucide-react` (đi kèm shadcn, không phải dependency mới), giữ vài cỡ cố định theo ngữ cảnh | Tránh mỗi chỗ một cỡ |
| Chuỗi UI viết thẳng tiếng Việt trong component, **không** dựng hệ thống i18n | STACK §5 |
| Nội dung 14 mục spec render **nguyên văn tiếng Anh** do backend trả, FE không dịch | STACK §10 — dịch ở FE làm lệch cái mà verifier đã chấm |
| Sửa enum ở `backend/src/contracts/` → sửa `types.ts` **và** `status-style.ts` trong **cùng commit** | STACK §3.1 luật 2 |
| Không thêm họ màu mới ngoài tám họ ở §2 | Thêm là phá luật "đỏ/cam/vàng = có vấn đề" ở §1 |
| **Không tắt vòng focus.** Giữ `:focus-visible` mặc định của shadcn; chỗ tự viết phải có vòng focus thấy được | Đi hết năm bước bằng bàn phím là một mục nghiệm thu (§6.10). Tắt outline cho "sạch" là cách nhanh nhất phá nó |
| Mọi nút chỉ có icon (`SourceChip`, nút xoá chip, nút mở accordion) phải có nhãn cho trình đọc màn hình | Không có chữ thì không có gì để đọc — và §6.7 đã cấm đặt thông tin trong `title`/hover |
| Thứ tự tab đi theo thứ tự đọc: ngữ cảnh → nội dung → quyết định | Trùng với thứ tự ba cột ở §1 nguyên tắc 2, nên không cần `tabindex` thủ công nếu DOM viết đúng thứ tự |
| Chuỗi mô tả trạng thái chờ (§5.5 luật 2) đặt cùng chỗ với `error-code.ts`, không rải trong component | Cùng lý do với ánh xạ enum: một nơi sửa, không phải mười chỗ |
| Ánh xạ `ConfidenceLevel` (§3.8) để trong `status-style.ts` nhưng **không** đi qua ba component badge | §3.8 — nó là dòng chữ trong `HintBox`, không phải vật thể thứ tư |

---

## 8. Mâu thuẫn phát hiện được

| # | Mâu thuẫn | Xử lý |
|---|---|---|
| 1 | Mockup 5 gắn nhãn stepper `1.Nhập ý tưởng · 2.Làm rõ · 3.Nghiên cứu · 4.Judge · 5.Spec cuối`, nhưng tiêu đề trang của mockup 1–4 lại là `1.Nhập ý tưởng & Làm rõ · 2.Nghiên cứu & Research Gap · 3.Contribution & Kế hoạch thí nghiệm · 4.Judge & Xác nhận` — lệch một bước | Lấy đánh số của mockup 1–4 (tự nhất quán và khớp 10 bước của đề). Nhãn chốt ở `ARCHITECTURE.md` §4 |
| 2 | Mockup 1–4 có một dải node ở đáy, mockup 5 có một dải node ở đầu — **và hai dải đó không phải cùng một thứ** | Đọc kỹ thì dải ở đáy đổi nhãn theo từng mockup (`Ý tưởng·Làm rõ·Xác nhận·Sang bước tiếp theo` ở mockup 1 và 3; thêm `Judge độc lập·Hoàn tất` ở mockup 4) và luôn kết bằng một node **Xác nhận** — đó là tiến độ *bên trong một vòng*, không phải 5 bước toàn cục. Chốt: `Stepper` 5 bước lên đầu trang cho cả năm bước (§6.11); dải ở đáy **giữ lại** thành `RoundTracker` trong `SummaryBar` (§5.3). Bản trước của file này coi hai dải là một và bỏ mất dải dưới — mất luôn phần UI thể hiện vòng lặp ở bước 10 của đề |
| 3 | Mockup 1–4 dùng nav có avatar xám không tên; mockup 5 có thêm chuông và tên user | Lấy nav của mockup 5, **bỏ chuông** (không có tính năng thông báo trong 16 chức năng) — có auth thì phải hiện được đang đăng nhập bằng tài khoản nào |
| 4 | Badge `MINOR` ở mockup 4 dùng chữ trắng trên nền vàng, không đọc được | Đổi sang chữ màu mực — §3.3 |
| 5 | Mockup 1 dùng cam để trang trí danh sách "Vấn đề chính", trong khi §1 nguyên tắc 4 giữ cam riêng cho `Severity` | Đổi khối đó sang họ `warn` |
| 6 | Kim-chỉ-nam §4 và STACK §5 (bản cũ) ghi "không cần responsive mobile, đừng tốn thời gian" | **Đã bỏ luật đó** theo yêu cầu của bạn. Responsive giờ là ràng buộc bắt buộc — §6. Cả hai file đã sửa; đề bài vốn không cấm, chỉ là không đòi |
| 7 | Mockup chỉ có bản desktop, không có bản mobile để đối chiếu | Toàn bộ phần mobile ở §6 là **[QĐ]**. Nếu giảng viên có bản mobile thì phải đối chiếu lại |
| 8 | Bản trước của file này xoá breakpoint mặc định, tự khai thang chiều cao nút, và chép chuỗi class/CSS/px vào tài liệu | **Đã bỏ hết.** File giờ chỉ mô tả ý đồ bằng ngôn ngữ tự nhiên; cách viết cụ thể do Tailwind + shadcn quyết lúc implement |
| 9 | Mockup 5 liệt kê **10 mục** trong "Bản đặc tả nghiên cứu cuối", nhưng đề bước 8 liệt kê **14 mục** (mockup thiếu *Proposed approach*, *Baselines và metrics*, *Ablation plan*, *Open issues*) | Lấy **14** theo đề — mockup là gợi ý, đề là yêu cầu. Đây cũng là con số mà `ARCHITECTURE.md` và chức năng 11 dùng. `SpecChecklist` phải cuộn được ở mobile vì 14 dòng dài hơn một màn 375px |
| 10 | **Không mockup nào vẽ bảng thẻ phân rã**, trong khi đề bước 2 + chức năng 3 đòi 8 loại thẻ × 6 trạng thái — và cả §3 của file này chỉ có nghĩa khi bảng đó tồn tại | Thêm `CardBoard` vào cột giữa của B1 (§5.4 #1). Nếu bỏ thì sáu `CardStatus` không bao giờ xuất hiện trên màn hình nào |
| 11 | **Mockup 3 không có cột quyết định** — cột phải là "Kiểm tra tính khả thi", thuần thông báo. Bước đó không có chỗ nào để người dùng chốt, trái NFR-G-3 | Thêm một `OptionList` gọn ở cuối cột phải B3: duyệt kế hoạch · giảm quy mô theo đề xuất · Other (§5.4 #2) |
| 12 | Mockup 1–2 vẽ option thành ô ngắn nằm ngang; mockup 4 vẽ option thành hàng chiếm trọn bề rộng có dấu tích | Không phải mâu thuẫn mà là **hai biến thể của cùng một component**, chọn theo độ dài nhãn — đã ghi vào `OptionList` (§5.3) |

---

## 9. Câu hỏi còn mở

- [ ] Nhãn năm bước stepper chốt theo mockup 1–4 — cần bạn xác nhận (§8 #1). *(chờ: bạn)*
- [ ] Stepper chuyển lên đầu trang — cần bạn xác nhận (§8 #2). *(chờ: bạn)*
- [ ] `Be Vietnam Pro` — nếu bạn muốn giữ đúng font của mockup thì cần biết tên font gốc; hiện tôi chỉ
      suy ra từ hình dáng chữ. *(chờ: bạn)*
- [ ] Có cần trang `Trợ giúp` thật không? Nav trong mockup có mục này nhưng nó **không** nằm trong 16
      chức năng bắt buộc. Tôi tạm coi là trang tĩnh một màn hình. *(chờ: bạn)*
- [ ] **`DecisionSheet` không đóng hẳn được** (§6.3) là lựa chọn cố ý nhưng khác thói quen. Nếu dùng
      thử thấy khó chịu thì phương án lùi là cho đóng hẳn nhưng để lại một nút nổi có badge đếm việc
      chờ. *(chờ: bạn, sau khi có bản chạy)*
- [ ] Responsive làm ở phase nào? Tôi xếp việc *nghiệm thu* vào phase 5, nhưng khung `WizardShell` và
      `DecisionSheet` phải dựng ngay từ phase 0 — không bọc mobile lên sau được. *(chờ: bạn)*
- [ ] Máy tính bảng nằm ngang có cần một tầng riêng không? Hiện nó dùng chung bố cục hai cột với
      tablet dọc. *(chờ: bạn)*
- [ ] **`CardBoard` ở B1** (§5.4 #1) là khối đề bắt buộc nhưng mockup không vẽ. Cần bạn xác nhận vị
      trí: dưới phần diễn giải trong cột giữa của B1, hay tách thành một bước riêng giữa B1 và B2.
      Tôi chọn phương án thứ nhất vì `ARCHITECTURE.md` §4 đã gộp bước 1–2 của đề vào B1. *(chờ: bạn)*
- [ ] **Khối quyết định thêm vào B3** (§5.4 #2) — mockup 3 không có, nhưng thiếu nó thì B3 tự chốt,
      trái NFR-G-3. Cần bạn xác nhận ba phương án *duyệt · giảm quy mô · Other* là đúng ý. *(chờ: bạn)*
- [ ] **`RoundTracker`** (§8 #2) — tôi đọc dải node ở đáy mockup 1–4 là tiến độ trong một vòng. Nếu
      giảng viên có ý khác thì đây là chỗ hiểu sai dễ xảy ra nhất trong cả file. *(chờ: bạn)*
- [ ] `SpecChecklist` lấy **14 mục** theo đề chứ không phải 10 mục như mockup 5 (§8 #9). *(chờ: bạn)*
