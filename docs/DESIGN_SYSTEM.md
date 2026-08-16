# DESIGN SYSTEM — SpecResearch Loop

Status: Draft — chờ verify
Ngày: 2026-08-16
Liên quan: `docs/SPECRESEARCH_LOOP-kim-chi-nam.md` (yêu cầu) · `docs/STACK.md` §5, §10 (ràng buộc công nghệ) · `docs/sample1..5.png` (mockup)

> File này chốt **màu, chữ, hình dạng, component**. Không chứa ERD, API hay luồng backend — những
> thứ đó ở `docs/ARCHITECTURE.md`.
>
> Mockup là **gợi ý**, đề nói rõ không cần làm y hệt (kim-chỉ-nam §1). Chỗ nào lệch mockup đều có
> ghi lý do trong bảng, đánh dấu **[QĐ]** = quyết định của tôi, không phải yêu cầu của đề.

---

## 1. Nguyên tắc thiết kế

Rút từ 5 mockup, xếp theo thứ tự ưu tiên khi phải đánh đổi:

1. **Viền chứ không bóng.** Giao diện phẳng. Ranh giới do đường viền 1px và nền trắng trên canvas
   xanh nhạt tạo ra. Chỉ card cấp 1 có bóng, và bóng gần như không thấy.
2. **Mỗi cột một vai, vai nào màu đó.** Trái = ngữ cảnh/input (xanh dương), giữa = nội dung hệ thống
   sinh ra (xanh lá / trung tính), phải = **chỗ người dùng phải quyết** (tím). Người dùng nhìn màu
   là biết đâu là nơi mình phải hành động — đây là cách UI thể hiện NFR *human-in-the-loop*.
3. **Trạng thái luôn có chữ, màu chỉ là phụ trợ.** Không bao giờ mã hoá thông tin chỉ bằng màu.
   Mọi badge đều mang nhãn chữ + icon riêng, đọc được khi in trắng đen (§3.4).
4. **Đỏ/cam/vàng là tài sản riêng của "có vấn đề".** Ngoài `Severity` và trạng thái hỏng, không
   dùng ba hue này để trang trí. Thấy đỏ trên màn hình = chắc chắn có gì sai.
5. **Bo góc giảm dần theo mức khẩn.** Thẻ mềm (14px) → hộp (10px) → tag (6px) → badge cảnh báo (4px).
   Hình dạng là tín hiệu thứ hai bên cạnh màu.
6. **Ba vai sống sót ở mọi bề rộng.** Mockup là bản desktop, nhưng ứng dụng phải chạy được trên điện
   thoại. Ở mobile ta **không** dồn 3 cột thành một dải cuộn dài — làm vậy là đẩy chỗ-phải-quyết
   xuống đáy trang và giết nguyên tắc 2. Ba vai được giữ bằng ba cơ chế khác nhau: ngữ cảnh thu vào
   accordion, nội dung chiếm toàn bộ bề rộng, **quyết định nằm trong bottom sheet luôn chạm tới
   được**. Chi tiết ở §6.

---

## 2. Design token (Tailwind v4)

Khai bằng `@theme` trong `frontend/src/app/globals.css`. **Không tạo `tailwind.config.*`** (STACK §5).

Hex lấy từ mockup. Tên token đặt theo **vai trò**, không theo màu — đọc `border-decide-200` là biết
"viền của vùng chờ người dùng quyết", đọc `border-violet-200` thì không biết gì.

```css
/* frontend/src/app/globals.css */
@import "tailwindcss";

@theme {
  /* ── Nền & mực ─────────────────────────────────────────── */
  --color-canvas:      #f6f8fc;   /* nền trang, hơi ngả xanh */
  --color-surface:     #ffffff;   /* card cấp 1 */
  --color-sunken:      #f9fafb;   /* header bảng, hộp lồng trong card */
  --color-line:        #e5e7eb;   /* viền mặc định */
  --color-line-strong: #d1d5db;   /* viền input, divider trong bảng số */
  --color-ink:         #0f172a;   /* tiêu đề */
  --color-ink-body:    #374151;   /* nội dung */
  --color-ink-muted:   #6b7280;   /* mô tả, caption */
  --color-ink-faint:   #9ca3af;   /* placeholder, bước chưa tới */

  /* ── brand · xanh dương — hành động chính, hệ thống ────── */
  --color-brand-50:  #eff6ff;
  --color-brand-100: #dbeafe;
  --color-brand-200: #bfdbfe;
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;

  /* ── decide · tím — CHỖ NGƯỜI DÙNG PHẢI QUYẾT ──────────── */
  --color-decide-50:  #f5f3ff;
  --color-decide-100: #ede9fe;
  --color-decide-200: #ddd6fe;
  --color-decide-600: #7c3aed;
  --color-decide-700: #6d28d9;

  /* ── ok · xanh lá — đã chốt, đã có bằng chứng ──────────── */
  --color-ok-50:  #f0fdf4;
  --color-ok-100: #dcfce7;
  --color-ok-200: #bbf7d0;
  --color-ok-600: #16a34a;
  --color-ok-700: #15803d;

  /* ── warn · hổ phách — cần làm rõ, chưa chắc ───────────── */
  --color-warn-50:  #fffbeb;
  --color-warn-100: #fef3c7;
  --color-warn-200: #fde68a;
  --color-warn-600: #d97706;
  --color-warn-700: #b45309;

  /* ── major · cam — CHỈ dùng cho Severity MAJOR ─────────── */
  --color-major-50:  #fff7ed;
  --color-major-200: #fed7aa;
  --color-major-600: #ea580c;

  /* ── minor · vàng — CHỈ dùng cho Severity MINOR ────────── */
  --color-minor-50:  #fefce8;
  --color-minor-200: #fef08a;
  --color-minor-400: #facc15;

  /* ── danger · đỏ — không có bằng chứng, lỗi chặn ───────── */
  --color-danger-50:  #fef2f2;
  --color-danger-100: #fee2e2;
  --color-danger-200: #fecaca;
  --color-danger-600: #dc2626;
  --color-danger-700: #b91c1c;

  /* ── neutral · xám lam — MISSING, viền phụ, chữ phụ ────── */
  --color-neutral-50:  #f8fafc;
  --color-neutral-200: #e2e8f0;
  --color-neutral-300: #cbd5e1;
  --color-neutral-500: #64748b;
  --color-neutral-600: #475569;

  /* ── Chữ ───────────────────────────────────────────────── */
  --font-sans: var(--font-be-vietnam-pro), ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "Cascadia Code", Consolas, monospace;

  --text-display: 1.875rem;  --text-display--line-height: 2.25rem;
  --text-display--font-weight: 700; --text-display--letter-spacing: -0.02em;
  --text-title:   1.125rem;  --text-title--line-height: 1.625rem;  --text-title--font-weight: 600;
  --text-card:    1rem;      --text-card--line-height: 1.5rem;     --text-card--font-weight: 600;
  --text-body:    0.875rem;  --text-body--line-height: 1.3125rem;
  --text-table:   0.8125rem; --text-table--line-height: 1.25rem;
  --text-meta:    0.75rem;   --text-meta--line-height: 1.125rem;   --text-meta--font-weight: 500;
  --text-badge:   0.6875rem; --text-badge--line-height: 0.875rem;
  --text-badge--font-weight: 700; --text-badge--letter-spacing: 0.04em;

  /* ── Bo góc ────────────────────────────────────────────── */
  --radius-card: 14px;
  --radius-box:  10px;
  --radius-tag:  6px;
  --radius-sev:  4px;

  /* ── Đổ bóng ───────────────────────────────────────────── */
  --shadow-card:  0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06);
  --shadow-pop:   0 10px 30px -8px rgb(15 23 42 / 0.18);
  --shadow-sheet: 0 -8px 28px -8px rgb(15 23 42 / 0.16);   /* bottom sheet, bóng hắt LÊN */
}
```

**Không khai `--breakpoint-*`.** Dùng nguyên 5 mốc mặc định của Tailwind — `sm` 640 · `md` 768 ·
`lg` 1024 · `xl` 1280 · `2xl` 1536. Bố cục 3 tầng ở §6.1 vừa khít `md` và `xl` nên không có lý do gì
để đụng vào. Đặc biệt **không xoá `sm`**: shadcn sinh ra class `sm:` trong `dialog`, `sheet`,
`drawer`, `alert-dialog`… — xoá là mọi component sinh sau đều phải sửa tay, đổi lấy đúng một thứ là
"kỷ luật", không đáng.

Cũng không cần khai `viewport` meta: Next.js App Router tự chèn
`width=device-width, initial-scale=1`.

**Font — [QĐ]:** `Be Vietnam Pro` qua `next/font/google` (đã có sẵn trong Next.js, **không phải
dependency mới**, không vi phạm STACK §8). Lý do chọn: mockup dùng một sans hình học có bụng chữ
tròn, và font này có dấu tiếng Việt vẽ riêng chứ không ghép — UI toàn tiếng Việt (STACK §10) nên đây
là tiêu chí quyết định. `--font-mono` dùng font hệ thống, chỉ xuất hiện trong `DiffView` và ô hiển
thị DOI.

**Vì sao đặt token riêng thay vì dùng palette mặc định của Tailwind v4:** Tailwind v4 đổi palette
sang OKLCH, hex không còn khớp mockup tuyệt đối; và quan trọng hơn, tên `violet-600` không mang
nghĩa. Đặt tên theo vai trò khiến quy tắc "cấm màu inline" (§7) kiểm tra được bằng grep.

**Phương án đã loại:** dùng biến CSS của shadcn (`--primary`, `--secondary`, `--muted`, …) làm lớp
token duy nhất. Loại vì bộ đó chỉ có ~8 khe, không đủ chỗ cho 12 giá trị enum ở §3 mà không phải
nhồi thêm tên vô nghĩa (`--chart-3`). Ta vẫn giữ biến shadcn cho `components/ui/`, nhưng **map chúng
về token của ta** (`--primary: var(--color-brand-600)` …) để chỉ có một nguồn sự thật.

---

## 3. Ánh xạ trạng thái → hình dạng + màu

Phần quan trọng nhất của file. Ba nhóm enum này **hiển thị cạnh nhau trên cùng một màn hình**
(rõ nhất là bước 4: `SpecCard` mang `CardStatus`, bảng issue mang `Severity`, nguồn đính kèm mang
`SupportLabel`). Nếu chỉ phân biệt bằng màu thì người đọc không biết một chấm đỏ đang nói về thẻ,
về issue hay về nguồn.

### 3.1 Nguyên tắc: hình dạng mã hoá NHÓM, màu mã hoá GIÁ TRỊ

| Nhóm | Vật thể | Bo góc | Nền | Viền | Chữ | Họ icon |
|---|---|---|---|---|---|---|
| **CardStatus** (6) | **pill** | `rounded-full` | tô nhạt `-50` | 1px `-200` (**đứt nét** cho MISSING) | sentence case, `text-meta font-semibold` | **vòng tròn**: ● ○ ⌀ ? ⊘ ! |
| **Severity** (3) | **khối đặc** | `rounded-sev` (4px) | tô đậm `-600` | không | UPPERCASE `text-badge` | **đa giác**: bát giác / tam giác / tròn-i |
| **SupportLabel** (3) | **tag rỗng** | `rounded-tag` (6px) | trong suốt | **1.5px** `-600` | UPPERCASE `text-badge` | **khiên**: khiên✓ khiên! khiên✕ |

Ba container này khác nhau ở cả bốn chiều (độ tròn, độ đặc, độ dày viền, họ icon) nên phân biệt được
kể cả khi bản in mất hết màu, kể cả khi ba badge nằm sát nhau trên một dòng.

Severity là khối **đặc, vuông nhất, chữ hoa** — cố ý nặng nhất trong ba nhóm, vì nó là thứ duy nhất
người dùng bắt buộc phải xử lý trước khi chốt spec. Mockup 4 đã dùng đúng ngôn ngữ này, ta giữ.

### 3.2 CardStatus — 6 trạng thái

Class nền: `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-meta font-semibold`

| Status | Nghĩa | Class riêng | Icon (lucide) | Hue | Vì sao hue này |
|---|---|---|---|---|---|
| `CONFIRMED` | user đã xác nhận | `bg-ok-50 border-ok-200 text-ok-700` | `CircleCheck` | ok | Đồng bộ với dấu ✓ xanh của stepper và của "Spec cuối cùng" ở mockup 4–5 |
| `PROPOSED` | hệ thống đề xuất, chờ user | `bg-surface border-brand-200 text-brand-700` | `Circle` | brand | Xanh dương = "do hệ thống sinh ra". **Nền trắng**, không tô — báo hiệu chưa được người dùng đóng dấu |
| `MISSING` | mục bắt buộc còn trống | `bg-transparent border-dashed border-neutral-300 text-neutral-500` | `CircleDashed` | neutral | Sự vắng mặt phải **lùi về sau**, không cạnh tranh chú ý với lỗi thật. Viền đứt nét là tín hiệu "chỗ trống", đọc được cả khi in |
| `AMBIGUOUS` | hiểu được nhiều nghĩa | `bg-warn-50 border-warn-200 text-warn-700` | `CircleHelp` | warn | Hổ phách = "chưa chắc", đúng như hộp *Mức chắc chắn* ở mockup 1 |
| `UNSUPPORTED` | không nguồn nào chống lưng | `bg-danger-50 border-danger-200 text-danger-700` | `CircleSlash` | danger | Đây là **lỗi chặn export** (verifier gate, xem ARCHITECTURE §6) — phải đỏ |
| `CONFLICT` | mâu thuẫn với thẻ khác | `bg-decide-50 border-decide-200 text-decide-700` | `CircleAlert` | decide | Tím = "cần người dùng phân xử". Máy không tự chọn bên nào được, đúng tinh thần mockup 4 |

**Chỗ hue đụng nhau, và vì sao cố ý:**
- `CONFIRMED` (xanh lá) đụng `SUPPORTED` (xanh lá) — cùng nghĩa "ổn rồi".
- `UNSUPPORTED` CardStatus đụng `UNSUPPORTED` SupportLabel (đỏ) — **cùng tên, cùng nghĩa**, chỉ khác
  cấp: một cái nói về cả thẻ, một cái nói về một cặp (claim, nguồn).
- `AMBIGUOUS` (hổ phách) đụng `WEAK` (hổ phách) — cùng nghĩa "chưa đủ chắc".

Giữ nguyên chủ ý: **màu giống nhau khi nghĩa giống nhau**, người dùng học một lần dùng cả ba nhóm.
Việc phân biệt nhóm đã do hình dạng gánh (§3.1), không cần bịa thêm hue thứ 7–8 chỉ để tránh trùng.

### 3.3 Severity + SupportLabel

**Severity** — class nền: `inline-flex items-center gap-1 rounded-sev px-2 py-0.5 text-badge uppercase`

| Severity | Class riêng | Icon | Hình icon | Sáng/tối khi in |
|---|---|---|---|---|
| `CRITICAL` | `bg-danger-600 text-white` | `OctagonAlert` | bát giác | **tối** (luma ≈ 92) |
| `MAJOR` | `bg-major-600 text-white` | `TriangleAlert` | tam giác | **trung** (luma ≈ 123) |
| `MINOR` | `bg-minor-400 text-ink` | `Info` | tròn | **sáng** (luma ≈ 197) |

Hai lớp bảo hiểm cho bản in trắng đen: (a) độ đậm nền đi thành thang tối → trung → sáng, (b) icon là
ba hình học khác nhau. **[QĐ] lệch mockup:** mockup 4 để badge MINOR chữ trắng trên nền vàng — tương
phản không đọc nổi; ta đổi sang chữ `ink` trên nền vàng.

**SupportLabel** — class nền: `inline-flex items-center gap-1 rounded-tag border-[1.5px] bg-transparent px-2 py-0.5 text-badge uppercase`

| Label | Class riêng | Icon | Nghĩa |
|---|---|---|---|
| `SUPPORTED` | `border-ok-600 text-ok-700` | `ShieldCheck` | abstract của nguồn thật sự chống lưng claim |
| `WEAK` | `border-warn-600 text-warn-700` | `ShieldAlert` | liên quan nhưng không đủ kết luận |
| `UNSUPPORTED` | `border-danger-600 text-danger-700` | `ShieldX` | nguồn không hỗ trợ, hoặc nguồn không tồn tại |

Tag **rỗng ruột** là cố ý: nó luôn nằm cạnh tên nguồn trong danh sách, nếu tô nền đặc thì mỗi dòng
nguồn thành một vệt màu và bảng related-work sẽ loạn. Họ icon khiên đọc là "phán quyết về bằng
chứng", tách hẳn khỏi họ vòng tròn của CardStatus.

### 3.4 Kiểm tra in trắng đen

| Tín hiệu | CardStatus | Severity | SupportLabel |
|---|---|---|---|
| Đường bao | tròn hoàn toàn | góc 4px | góc 6px, viền dày 1.5px |
| Độ đặc của nền | rất nhạt hoặc trong | **đặc** | **trong suốt** |
| Kiểu chữ | Sentence case | UPPERCASE | UPPERCASE |
| Icon phân biệt trong nhóm | 6 glyph vòng tròn khác nhau | 3 hình đa giác khác nhau | 3 glyph trong khiên |
| Nhãn chữ | luôn hiện | luôn hiện | luôn hiện |

Không có giá trị nào chỉ phân biệt được bằng màu. Đây cũng là lý do **cấm** rút gọn badge thành chấm
tròn không chữ ở bất kỳ đâu, kể cả trong ô bảng chật.

### 3.5 Màu theo trạng thái ở cấp thẻ (`SpecCard`)

Thẻ nội dung không tô nền theo trạng thái (6 nền màu cạnh nhau sẽ rối). Thay vào đó:

- **Rail trái 3px** `border-l-[3px] border-l-<hue>-600` theo `CardStatus`.
- **StatusChip** ở góc phải header thẻ.
- Riêng `MISSING`: cả viền thẻ chuyển `border-dashed border-neutral-300`, nền `bg-neutral-50`, chữ
  mờ đi — thẻ trông như "ô còn trống chờ điền", vì đó chính xác là nó.

---

## 4. Typography · spacing · radius · border · shadow

### 4.1 Bậc chữ — 7 bậc, mỗi bậc một chỗ dùng

Cột **mobile** là giá trị dưới 768px. Chỉ 2 trong 7 bậc đổi cỡ — phần còn lại giữ nguyên, vì 14px và
13px đã là ngưỡng đọc thoải mái trên điện thoại, thu nhỏ nữa là hại.

| Token | ≥768px | < 768px | Weight | Dùng ở đâu (và **chỉ** ở đó) |
|---|---|---|---|---|
| `text-display` | 30 / 36 | **22 / 28** | 700 | H1 của `PageHeader`. Một trang đúng một cái |
| `text-title` | 18 / 26 | **17 / 24** | 600 | Tiêu đề dialog/sheet, tiêu đề trang login/register |
| `text-card` | 16 / 24 | 16 / 24 | 600 | Tiêu đề `Panel` (nhận màu accent của cột), tiêu đề `SpecCard` |
| `text-body` | 14 / 21 | 14 / 21 | 400 | Mặc định toàn app: nội dung thẻ, nhãn nút, nhãn option |
| `text-table` | 13 / 20 | 13 / 20 | 400 | Ô bảng ở desktop; ở mobile là nhãn trường trong card (§6.5) |
| `text-meta` | 12 / 18 | 12 / 18 | 500 | `HintBox`, dòng "Ví dụ: …", nhãn `StatTile`, mô tả dưới `JudgeCard`, `StatusChip` |
| `text-badge` | 11 / 14 | 11 / 14 | 700, +0.04em | `SeverityBadge`, `SupportTag`, `JudgeTracePill` |

Không có bậc nào khác. Cần to hơn `display` → sai chỗ; cần nhỏ hơn `badge` → không đọc được.

Cách viết: `class="text-[22px] leading-7 md:text-display"` — mobile-first, `md:` là ngoại lệ.

### 4.2 Spacing — bội số 4px, dùng 7 nấc

| Nấc | Chỗ dùng | Ở mobile |
|---|---|---|
| `1` (4px) | khe giữa icon và chữ trong badge | như cũ |
| `2` (8px) | khe icon ↔ chữ trong nút, giữa các chip từ khoá | như cũ |
| `3` (12px) | khe giữa các phần tử trong một card (`space-y-3`) | như cũ |
| `4` (16px) | padding trong hộp lồng, padding ô bảng theo chiều ngang | **cũng là padding của `Panel` và của page container** |
| `5` (20px) | **padding của `Panel`** và **gap giữa 3 cột** — nhịp chủ đạo của trang | tụt xuống `4` |
| `6` (24px) | padding ngang/dọc của page container | tụt xuống `4` |
| `8` (32px) | khoảng giữa `PageHeader` và lưới 3 cột | tụt xuống `5` |

Tức là ở mobile cả trang chỉ còn một nhịp lề duy nhất **16px**. Màn hình 375px trừ 2×16 còn 343px
cho nội dung; giữ lề 24px như desktop là mất thêm 5% bề rộng mà không đổi lại được gì.

### 4.2b Vùng chạm trên mobile

**Không tự định nghĩa thang kích thước nút.** Dùng prop `size` của shadcn `Button` (`xs` · `sm` ·
`default` · `lg` + các biến thể `icon-*`). shadcn đã cân đối sẵn chiều cao/padding và cập nhật theo
version — ta ghi đè là tự ôm việc bảo trì.

| Tình huống | Cách làm |
|---|---|
| Nút hành động chính trên mobile (`DecisionSheet`, `ExportBar`) | `<Button size="lg" className="w-full">` |
| Nút thường trong form, filter | `size="default"` |
| Nút icon-only | `size="icon"` — **không** thu nhỏ hơn |
| Khe giữa hai vùng chạm liền nhau | ≥ `gap-2` (8px) |

**Chỗ phải tự kiểm** là những thứ ta tự viết chứ không phải `Button` của shadcn: nút `×` trên chip từ
khoá, icon nguồn trong bảng related work, nút mở accordion, chấm của `StepperCompact`. Ba chỗ này
nới vùng bấm bằng padding hoặc lớp phủ `::before` — **không** bằng cách phóng to icon (icon vẫn
16/18/20px như §7.3).

Ngưỡng tham chiếu, dùng để **kiểm** chứ không phải để ghi đè hệ nút: WCAG 2.2 SC 2.5.8 (AA) đòi tối
thiểu 24×24 CSS px; Apple HIG khuyến nghị 44pt, Material 48dp. Kích thước mặc định của shadcn đã nằm
trên ngưỡng AA; các nút tự viết chỉ cần không rơi xuống dưới nó.

### 4.3 Bo góc — thang giảm theo mức khẩn

| Token | px | Dùng |
|---|---|---|
| `rounded-card` | 14 | `Panel`, `Dialog`, `AuthCard` |
| `rounded-box` | 10 | hộp lồng trong panel, `Button`, `Input`, `OptionRow`, `StatTile`, icon tile |
| `rounded-tag` | 6 | `SupportTag`, chip từ khoá có nút × |
| `rounded-sev` | 4 | `SeverityBadge` — vuông nhất = khẩn nhất |
| `rounded-full` | — | `StatusChip`, `JudgeTracePill`, chấm đếm, avatar, node của `Stepper` |

### 4.4 Border

| Kiểu | Dùng |
|---|---|
| `border border-line` | mặc định của mọi `Panel`, hộp lồng, ô bảng |
| `border border-<accent>-200` | `Panel` mang accent (cột quyết định dùng `border-decide-200`) |
| `border-2 border-<accent>-600` | **option đang được chọn** — dày gấp đôi là tín hiệu chọn, không phải màu |
| `border-[1.5px]` | chỉ `SupportTag` |
| `border-dashed border-neutral-300` | chỉ `MISSING` (chip và thẻ) |
| `border-l-[3px]` | rail trái của `SpecCard` |

Không dùng viền dày hơn 2px ở bất kỳ chỗ nào khác.

### 4.5 Shadow — 3 nấc, và một luật

| Token | Dùng |
|---|---|
| `shadow-card` | **chỉ** card cấp 1 (`Panel`, `AuthCard`, `SummaryBar`) |
| `shadow-pop` | phần tử nổi trên mặt phẳng: `Dialog`, `DropdownMenu`, `Popover`, `Tooltip` |
| `shadow-sheet` | **chỉ** `DecisionSheet` và `MobileNavDrawer` — bóng hắt **lên** (offset âm), báo hiệu lớp này neo vào cạnh màn hình chứ không trôi giữa trang |

**Luật:** hộp lồng bên trong `Panel` **không bao giờ** có shadow — chúng dùng `bg-sunken` hoặc viền
để tách lớp. Ở trạng thái nghỉ, desktop chỉ có `shadow-card`; mobile có thêm đúng một `shadow-sheet`
ở đáy.

---

## 5. Component inventory

Cột **Nguồn**: `shadcn` = dùng thẳng · `shadcn+` = shadcn sửa lại · `tự viết` = viết mới trong
`frontend/src/components/`.

### 5.1 Primitive — lấy thẳng từ shadcn

`button` · `input` · `textarea` · `label` · `checkbox` · `radio-group` · `select` · `separator` ·
`tooltip` · `dialog` · `dropdown-menu` · `popover` · `skeleton` · `sonner` (toast) · `scroll-area` ·
`avatar` · `tabs` · `accordion` · `progress` · `form` · **`sheet`** · **`drawer`**

Không sửa gì ngoài việc map biến CSS của shadcn về token ở §2, và đổi `sm:` → `md:` (§2).

`sheet` và `drawer` là hai component có sẵn của shadcn, thêm vào để phục vụ mobile (§6) — không phải
dependency mới. `drawer` (dựa trên `vaul`, đi kèm shadcn) cho cảm giác kéo-thả tự nhiên nên dùng cho
`DecisionSheet`; `sheet` đơn giản hơn nên dùng cho `MobileNavDrawer`.

### 5.2 Primitive sửa lại

| Component | Nguồn | Sửa gì |
|---|---|---|
| `Card` | shadcn+ | `p-5`, `rounded-card`, `shadow-card`, thêm slot header có icon tile + accent |
| `Table` | shadcn+ | header `bg-sunken`, ô `text-table`, viền `border-line`, bỏ hover đổi nền |
| `Badge` | shadcn+ | xoá hết variant mặc định — badge trong app **chỉ** đi qua 3 component ở §5.3 |
| `Button` | shadcn+ | thêm size `md` (cao 40px, `rounded-box`), variant `soft` (nền `-50`, chữ `-700`) |
| `Alert` | shadcn+ | đổi tên dùng thành `HintBox` (§5.3) |

### 5.3 Tự viết — app component

**Khung trang**

| Component | Trách nhiệm |
|---|---|
| `TopNav` | ≥768px: logo + 4 mục (Trang chủ · Dự án · Lịch sử phiên bản · Trợ giúp) + `UserMenu`. Mục active: chữ `brand-600` + gạch chân 2px. <768px: nút ☰ + logo + avatar |
| `MobileNavDrawer` | **[mobile]** Sheet trượt từ trái chứa 4 mục nav + thông tin user + Đăng xuất. Chỉ tồn tại dưới 768px |
| `UserMenu` | Avatar chữ cái đầu + tên + dropdown (Tài khoản, Đăng xuất). Dưới 768px chỉ còn avatar, nội dung dồn vào `MobileNavDrawer` |
| `PageHeader` | Icon tile 56px (mobile 40px) + H1 `text-display` + phụ đề. Ở mobile phụ đề cắt còn 2 dòng, bấm để mở rộng |
| `Stepper` | ≥768px: 5 bước ngang, **sticky dưới `TopNav`**. done = tròn đặc `ok-600` + ✓ · current = tròn đặc `brand-600` + số + gạch chân · todo = tròn viền `neutral-300` + số mờ |
| `StepperCompact` | **[mobile]** Dải 44px: 5 chấm + "Bước 3/5" + tên bước hiện tại, bấm mở `StepPickerSheet`. Thay `Stepper` dưới 768px |
| `StepPickerSheet` | **[mobile]** Sheet liệt kê 5 bước kèm trạng thái, cho nhảy về bước đã qua |
| `WizardShell` | Chọn bố cục theo bề rộng (§6.3): 1 cột + sheet · 2 cột · 3 cột. Nhận prop `layout` = `balanced` \| `wideCenter` \| `two` |
| `DecisionSheet` | **[mobile]** Bottom sheet 3 nấc giữ toàn bộ cột quyết định. **Không đóng hẳn được** — xem §6.3 |
| `SummaryBar` | Dải đáy "Tóm tắt sau vòng N" + `HintBox` bên phải. **Không** lặp lại stepper. Ở mobile xếp dọc, nằm **trên** vùng chừa cho `DecisionSheet` |

**Hiển thị trạng thái — 3 component độc quyền đọc bảng ánh xạ**

| Component | Trách nhiệm |
|---|---|
| `StatusChip` | `CardStatus` → pill (§3.2). Nơi **duy nhất** đọc `CARD_STATUS_STYLE` |
| `SeverityBadge` | `Severity` → khối đặc (§3.3). Nơi **duy nhất** đọc `SEVERITY_STYLE` |
| `SupportTag` | `SupportLabel` → tag rỗng (§3.3). Nơi **duy nhất** đọc `SUPPORT_LABEL_STYLE` |

**Nội dung spec**

| Component | Trách nhiệm |
|---|---|
| `Panel` | Card cấp 1 có accent — viên gạch dựng nên mọi cột. Prop `accent`, `icon`, `title`, `action` |
| `SpecCard` | Một thẻ trong 8 loại: rail trái theo `CardStatus` + `StatusChip` + nội dung + nguồn đính kèm |
| `GapCard` | Thẻ gap với 4 câu hỏi bắt buộc của đề (đã làm gì / hạn chế gì / vì sao quan trọng / kiểm nghiệm ra sao) — thiếu ô nào thì ô đó `MISSING` |
| `ClaimEvidenceCard` | Bảng 5 hàng: Claim · Baseline · Metric · Evidence · **Điều kiện bác bỏ**. Nhãn trái `brand-700` trên `bg-sunken` |
| `RelatedWorkTable` | 5 cột theo mockup 2 (Nghiên cứu · Đã làm gì · Loại feedback · Điểm còn thiếu · Nguồn). Dưới 768px đổi sang `RelatedWorkCardList` |
| `RelatedWorkCardList` | **[mobile]** Mỗi paper một card: tên+năm làm tiêu đề, 3 trường còn lại là hàng nhãn–giá trị, `SourceChip` + `SupportTag` ở chân card |
| `SourceChip` | Nút mở popover thông tin nguồn: title, năm, venue, DOI, link ngoài + `SupportTag` |
| `ExperimentPlanList` | TN1…TNn: badge + tiêu đề + bullet |
| `StatTileGrid` / `StatTile` | Lưới ô thông số (Model, Seed prompts, Candidates, Số vòng…) |
| `EstimateRows` | VRAM / Thời gian / Token / Chi phí + `HintBox variant="warn"` khi vượt RTX 3090 |
| `SpecChecklist` | 14 mục spec + đủ/thiếu (mockup 5 cột trái) |

**Tương tác & quyết định**

| Component | Trách nhiệm |
|---|---|
| `OptionList` | A/B/C/**Other**. **Tự chèn option `Other` nếu API không trả về** — đây là NFR, không để phụ thuộc LLM. Chọn `Other` thì bắt buộc nhập lý do |
| `OptionHint` | Dòng "Ví dụ: …" với icon bóng đèn, `text-meta text-decide-700` |
| `HintBox` | Hộp gợi ý/cảnh báo. Variant `info` \| `ok` \| `warn` \| `danger`. Dùng cho "Gợi ý", "Mức chắc chắn", cảnh báo vượt tài nguyên, banner kết thúc |
| `ConfirmDialog` | Cửa ngõ **bắt buộc** cho mọi thao tác tạo version mới / chốt spec. Không có đường nào chốt spec mà không qua đây |

**Judge & issue**

| Component | Trách nhiệm |
|---|---|
| `JudgePanel` | 5 `JudgeCard` + dải "Các Judge đánh giá độc lập, không xem nhận xét của nhau". ≥768px: lưới 5 cột. <768px: **snap-scroll ngang** + chấm chỉ vị trí (§6.5) |
| `JudgeCard` | Tên judge + icon + **dãy chấm trạng thái** bám SSE (chờ / đang chạy / xong / lỗi) + mô tả 1 dòng. Ở mobile rộng cố định 240px trong carousel |
| `IssueTable` | Cột: Severity · Vấn đề · Lý do · **Judge** · Thao tác. Sort mặc định theo severity giảm dần. Dưới 768px đổi sang `IssueCardList` |
| `IssueCardList` | **[mobile]** Mỗi issue một card: `SeverityBadge` + tiêu đề ở đầu, lý do ở giữa, `JudgeTracePill` ở chân. Giữ nguyên thứ tự sort theo severity |
| `JudgeTracePill` | Pill `J1`…`J5`. Nhiều judge cùng nêu → hiển thị cả nhóm, đây là bằng chứng trace của đề |
| `ConsensusMeter` | Thanh nhỏ "3/5 judge đồng ý" — hiện thực chức năng 13 ở mức nhìn thấy được |

**Version & xuất bản**

| Component | Trách nhiệm |
|---|---|
| `DiffView` | Bọc `react-diff-viewer-continued` (STACK §0), ép màu về token `ok`/`danger`, header `v3 → v4`. **`splitView={false}` dưới 768px** — diff 2 cột ở 375px thì mỗi cột còn ~160px, không đọc được |
| `VersionTimeline` | Danh sách version + chọn 2 bản để so. Ở mobile: chọn bản gốc bằng sheet thay vì 2 dropdown cạnh nhau |
| `DecisionLog` | Lịch sử quyết định: thời điểm · câu hỏi · option đã chọn · lý do — mục 14 của spec. Bảng ở desktop, card list ở mobile |
| `BeforeAfter` | Hai hàng Trước/Sau (mockup 5); dùng lại làm preview trước khi tạo version mới. Vốn đã xếp dọc nên không cần đổi |
| `ExportBar` | Xác nhận spec · Chỉnh sửa thêm · Xuất PDF · Xuất Markdown. **Disable + lý do hiển thị dạng chữ** khi verifier còn chặn — tooltip không dùng được trên cảm ứng (§6.7). Mobile: nút chính `w-full`, 3 nút còn lại lưới 3 cột |

**Tìm nguồn**

| Component | Trách nhiệm |
|---|---|
| `KeywordChipInput` | Ô nhập + chip từ khoá có nút × |
| `SourceFilterList` | Checkbox "Nguồn ưu tiên" (peer-reviewed, proceedings, …) |

**Auth & trạng thái chung**

| Component | Trách nhiệm |
|---|---|
| `AuthCard` | Khung 420px giữa canvas cho login/register: logo, `text-title`, form, link chuyển trang |
| `LoginForm` / `RegisterForm` | react-hook-form + zod; lỗi hiển thị bằng cách map `ErrorCode` → tiếng Việt (`lib/error-code.ts`) |
| `JobProgress` | Bám SSE, dùng chung cho analyze / search / judge / verify |
| `EmptyState` / `ErrorState` | Trạng thái rỗng và lỗi dùng chung |

---

## 6. Layout & Responsive — desktop **và** mobile

Ứng dụng phải chạy được ở cả hai đầu: điện thoại 375px và desktop 1440px. Mockup của giảng viên chỉ
vẽ bản desktop, nên toàn bộ phần mobile dưới đây là **[QĐ]** — suy ra từ mockup chứ không sao chép.

### 6.1 Ba tầng bố cục, trên breakpoint mặc định của Tailwind

Dùng **nguyên** thang breakpoint của Tailwind, không thêm không bớt (§2):

| Tiền tố | `sm` | `md` | `lg` | `xl` | `2xl` |
|---|---|---|---|---|---|
| Bề rộng | 640 | **768** | 1024 | **1280** | 1536 |

Bố cục cấp trang chỉ dùng **2 trong 5 mốc** — `md` và `xl`. Ba mốc còn lại vẫn tồn tại và shadcn vẫn
dùng chúng bên trong `components/ui/`; ta không đụng tới.

| Tầng | Bề rộng | Bố cục | Tiền tố |
|---|---|---|---|
| **Mobile** | 0 – 767 | **1 cột + bottom sheet** | (không tiền tố — mobile-first) |
| **Tablet** | 768 – 1279 | **2 cột**: ngữ cảnh+nội dung bên trái, quyết định bên phải `sticky` | `md:` |
| **Desktop** | ≥ 1280 | **3 cột** đầy đủ. Container `max-w-[1440px] mx-auto px-6`, `gap-5` | `xl:` |

Viết mobile-first như Tailwind hướng dẫn: class không tiền tố áp cho mọi bề rộng, `md:`/`xl:` chỉ
chồng thêm khi màn hình rộng ra.

Bề rộng kiểm tra: **375px** (dưới `sm`, điện thoại phổ biến nhất), **768px** (đúng mốc `md`),
**1280px** (đúng mốc `xl`). Thiết kế tham chiếu vẫn là 1440px nhưng ≥1280 không đổi bố cục nữa nên
không cần kiểm riêng. Ba con số này là điều kiện nghiệm thu ở §6.10.

### 6.2 Vấn đề thật của màn hình này

Không phải "thu nhỏ chữ lại là xong". Bốn thứ trong mockup thực sự vỡ dưới 768px:

| Khối | Vỡ vì sao |
|---|---|
| Lưới 3 cột | 375px chia 3 còn ~110px/cột |
| `RelatedWorkTable` 5 cột, ô chứa 2–3 câu | Cột hẹp nhất còn ~50px, chữ xuống dòng từng ký tự |
| `JudgePanel` 5 thẻ ngang | Mỗi thẻ ~65px |
| Cột quyết định (mockup 1: 3 câu hỏi; mockup 4: A/B/C/D + nút chốt) | Nếu xếp cuối trang thì **mọi thao tác đều phải cuộn hết trang mới tới** — đây mới là lỗi nặng nhất, vì nó phá NFR human-in-the-loop chứ không chỉ xấu |

### 6.3 Ba vai sống sót thế nào — quyết định quan trọng nhất của §6

Desktop có ba vai theo ba cột (§1 nguyên tắc 2). Ở mobile ta giữ ba vai bằng **ba cơ chế khác nhau**,
không phải bằng cách xếp chồng cả ba:

| Vai | Desktop | Mobile | Vì sao |
|---|---|---|---|
| **Ngữ cảnh / input** (cột 1) | cột trái | **Accordion**, mặc định **đóng** sau khi bước đó đã có dữ liệu | Là thứ đã xong, chỉ tra lại khi cần. Nghiên cứu pattern: accordion hợp với "nội dung cần tiết kiệm chỗ mà vẫn nằm tại chỗ" |
| **Nội dung hệ thống sinh ra** (cột 2) | cột giữa | **Chiếm toàn bộ bề rộng**, cuộn dọc bình thường | Là thứ user tới để đọc |
| **Quyết định** (cột 3) | cột phải | **`DecisionSheet` — bottom sheet neo đáy** | Là thứ user tới để **làm**. Bottom sheet là pattern chuẩn cho "thông tin/điều khiển quan trọng tạm thời, luôn trong tầm ngón cái" |

```
MOBILE (375px)                       TABLET (768px)              DESKTOP (1280px+)
┌──────────────────────┐   ┌────────────┬────────────┐  ┌───────┬─────────┬───────┐
│ ☰  SpecResearch  ⏺  │   │ TopNav (4 mục) + user   │  │ TopNav (4 mục) + user   │
├──────────────────────┤   ├────────────┴────────────┤  ├───────┴─────────┴───────┤
│ ●●●○○ Bước 3/5    ⌄ │   │ Stepper 5 bước ngang    │  │ Stepper 5 bước ngang    │
├──────────────────────┤   ├────────────┬────────────┤  ├───────┬─────────┬───────┤
│ [◈] 3. Contribution  │   │ ngữ cảnh   │            │  │       │         │       │
│     & Kế hoạch TN    │   ├────────────┤ quyết định │  │ ngữ   │ nội     │ quyết │
├──────────────────────┤   │            │  (sticky)  │  │ cảnh  │ dung    │ định  │
│ ▸ Ngữ cảnh    (đóng) │   │ nội dung   │            │  │       │         │(sticky)│
│                      │   │            │            │  │       │         │       │
│ ┌──────────────────┐ │   │            │            │  │       │         │       │
│ │  nội dung chính  │ │   ├────────────┴────────────┤  ├───────┴─────────┴───────┤
│ │  (cuộn dọc)      │ │   │ SummaryBar              │  │ SummaryBar              │
│ └──────────────────┘ │   └─────────────────────────┘  └─────────────────────────┘
│ SummaryBar           │
│ ░ chừa 96px cho sheet│
├──────────────────────┤
│ ⚠ Cần bạn quyết: 3   │ ← DecisionSheet, nấc "peek"
│ [  Xem & chọn     ]  │   luôn hiện, không đóng được
└──────────────────────┘
```

**`DecisionSheet` — ba nấc và một luật khác thường:**

| Nấc | Cao | Nội dung |
|---|---|---|
| `peek` | 96px (+ safe-area) | Một dòng tóm tắt việc cần quyết + nút chính `w-full` |
| `half` | 60vh | Danh sách câu hỏi / `OptionList` đầy đủ |
| `full` | 92vh | Thêm `OptionHint`, phần "Cách hệ thống đang hiểu lựa chọn", ô nhập lý do cho `Other` |

**Luật:** sheet **không bao giờ đóng hẳn**, kéo xuống hết chỉ về `peek`. Đây là chỗ nó khác một bottom
sheet thông thường (vốn là overlay tuỳ chọn, dismiss được). Lý do nằm ở nghiệp vụ: hệ thống này
*không có bước nào tự chốt* — luôn tồn tại một việc chờ người dùng, nên chỗ chứa việc đó không được
biến mất. Khi bước hiện tại không còn gì để quyết, `peek` đổi sang trạng thái xong (nền `ok-50`, chữ
"Đã đủ điều kiện sang bước 4") và nút chính thành "Sang bước tiếp theo".

Trang nội dung phải có `pb-24` để dòng cuối không bị `peek` che.

### 6.4 Preset lưới cột

| Preset | Desktop (`xl:`) | Tablet (`md:`) | Mobile | Dùng cho |
|---|---|---|---|---|
| `balanced` | `1fr 1.15fr 1.25fr` | `1fr 0.9fr` | 1 cột + sheet | Bước 1, Bước 3 |
| `wideCenter` | `0.85fr 1.7fr 1.15fr` | `1.4fr 1fr` | 1 cột + sheet | Bước 2, Bước 4 |
| `two` | `1fr 1fr` | `1fr 1fr` | 1 cột (không sheet) | Bước 5 |

Bước 5 không có cột quyết định riêng — hành động của nó là `ExportBar`, nên ở mobile `ExportBar`
thành thanh sticky đáy thay cho `DecisionSheet`.

### 6.5 Bảng và khối nhiều cột → pattern nào

Ba pattern phổ biến cho bảng trên mobile: **cuộn ngang có khoá cột đầu** · **đổi mỗi hàng thành
card** · **priority+ (giấu cột phụ sau nút "thêm")**. Chọn theo tính chất dữ liệu, không chọn theo
thói quen:

| Khối | Pattern chọn | Vì sao |
|---|---|---|
| `RelatedWorkTable` (4–8 hàng, ô 2–3 câu) | **Card** | Số hàng ít và người dùng đọc **từng paper một**, không so ngang. Cuộn ngang ở đây bắt swipe qua lại để ghép nghĩa một hàng — tệ nhất trong ba lựa chọn |
| `IssueTable` (4–12 hàng) | **Card**, giữ sort theo severity | Cũng đọc từng cái. `SeverityBadge` lên đầu card làm thang ưu tiên vẫn quét được bằng mắt |
| `DecisionLog` (có thể vài chục hàng) | **Card** + lọc theo bước | Cùng lý do; nếu sau này dài quá thì thêm bộ lọc, không quay lại bảng |
| `ClaimEvidenceCard` (5 hàng nhãn–giá trị) | **Nhãn trên, giá trị dưới** | Vốn đã là key–value, chỉ đổi từ 2 cột sang 2 dòng |
| `StatTileGrid` (7 ô) | **Lưới 2 cột** | Ô ngắn, 2 cột ở 375px vừa đủ 160px/ô |
| `JudgePanel` (5 thẻ **đồng dạng, ngắn**) | **Cuộn ngang snap** + chấm chỉ vị trí | Ngoại lệ duy nhất được cuộn ngang. 5 judge là các phần tử **ngang hàng nhau**; xếp dọc thành 5 thẻ cao thì mất ẩn dụ "panel hội đồng", mà đó chính là điều đề bài nhấn mạnh |
| `DiffView` | **Unified** thay vì split | 2 cột ở 375px còn ~160px/cột |

Card không phải là "bảng bị bẻ". Mỗi card có cấu trúc riêng: trường định danh làm tiêu đề, thao tác
làm icon ở góc, phần còn lại là các hàng nhãn–giá trị.

### 6.6 Điều hướng ở mobile

| Thành phần | Quyết định | Vì sao |
|---|---|---|
| 4 mục nav toàn cục | Nút ☰ → `MobileNavDrawer` trượt từ trái | Tần suất thấp (chuyển dự án, xem lịch sử). Không đáng chiếm đáy màn hình |
| **Đáy màn hình** | Dành **riêng** cho `DecisionSheet` / `ExportBar` | Vùng ngón cái phải thuộc về hành động chính, không thuộc về điều hướng. Đây là lý do **không** làm bottom tab bar |
| Stepper | `StepperCompact` sticky: 5 chấm + "Bước 3/5" + tên bước, bấm mở `StepPickerSheet` | Kết hợp *dots stepper* (thấy tổng quan) và *text stepper* (thấy chính xác đang ở đâu) — hai biến thể chuẩn cho mobile. 5 nhãn tiếng Việt dài không thể nằm ngang ở 375px |

**Chiều cao neo:**

| | Mobile | Tablet/Desktop |
|---|---|---|
| `TopNav` | 56px | 64px |
| `Stepper` | 44px (`StepperCompact`) | 48px |
| **`sticky top-*`** | `top-[100px]` | `top-[112px]` |

### 6.7 Cảm ứng — ba luật không được quên

1. **Không có `:hover` mang thông tin.** Mọi thứ chỉ hiện khi hover phải có đường thứ hai trên cảm
   ứng. Cụ thể: `SourceChip` hiện popover khi **bấm**; lý do `ExportBar` bị disable hiển thị thành
   **chữ dưới nút**, không phải tooltip.
2. **Vùng chạm** (§4.2b) — nút chính `size="lg" w-full`; kiểm bằng mắt các nút tự viết: `×` của chip
   từ khoá, icon nguồn, chấm `StepperCompact`.
3. **`env(safe-area-inset-bottom)`** cho `DecisionSheet` và `ExportBar`, nếu không thì trên iPhone
   nút chính nằm dưới thanh gesture.

### 6.8 Container query — dùng đúng một chỗ

Tailwind v4 có container query sẵn trong lõi (`@container` + biến thể `@sm:` / `@max-md:`), không cần
plugin. Dùng **chỉ** cho component xuất hiện ở nhiều bề rộng khác nhau trong cùng một tầng màn hình:
`StatTileGrid`, `OptionList`, `ClaimEvidenceCard` — chúng nằm trong cột hẹp ở desktop nhưng chiếm
toàn bề rộng ở mobile và trong `DecisionSheet`.

Mọi thứ khác dùng breakpoint thường. **Không** dùng container query để thay thế `md:`/`xl:` ở tầng bố
cục trang — hai hệ song song sẽ khiến không ai đoán được cái nào thắng.

### 6.9 Từng bước wizard trên mobile

| Bước | Ngữ cảnh → accordion | Nội dung → toàn bề rộng | Quyết định → `DecisionSheet` |
|---|---|---|---|
| **B1** Nhập ý tưởng | *Không thu gọn* — ô nhập ý tưởng là hành động chính của bước này, để mở | Cách hệ thống hiểu + Vấn đề chính + Mức chắc chắn | 3 câu hỏi làm rõ, mỗi câu một khối trong sheet |
| **B2** Nghiên cứu | Từ khoá + "Nguồn ưu tiên" (đóng) | `RelatedWorkCardList` | Research gap + lựa chọn hướng |
| **B3** Contribution | Contribution + `ClaimEvidenceCard` (mở) | `ExperimentPlanList` → `StatTileGrid` 2 cột → `EstimateRows` → cảnh báo vượt tài nguyên | Duyệt claim–evidence và kế hoạch |
| **B4** Judge | "Spec tạm thời" (đóng) | `JudgePanel` carousel → dải "judge độc lập" → `IssueCardList` | `OptionList` A/B/C/Other → `BeforeAfter` → nút xác nhận |
| **B5** Spec cuối | — | `SpecChecklist` → tóm tắt → `BeforeAfter` | Không có sheet; `ExportBar` sticky đáy |

Nguyên tắc chung: **accordion mở hay đóng phụ thuộc bước đó user còn phải nhập gì không**, không phải
theo vị trí cột ở desktop.

### 6.10 Nghiệm thu responsive

Coi là xong khi ở **375px**, **768px** và **1280px**:

- [ ] Không có cuộn ngang ở cấp trang (`document.body.scrollWidth <= innerWidth`) — trừ 2 vùng cố ý:
      `JudgePanel` carousel và khối code trong `DiffView`
- [ ] Ở mọi bước, thao tác chính chạm tới được **không cần cuộn** (mobile: nằm trong `DecisionSheet`)
- [ ] Nút chính mỗi bước dùng `size="lg" w-full`; các nút tự viết (× của chip, icon nguồn, chấm
      stepper) không rơi xuống dưới ngưỡng WCAG 24×24 — §4.2b
- [ ] Không thông tin nào **chỉ** xuất hiện khi hover
- [ ] 6 `CardStatus` + 3 `Severity` + 3 `SupportLabel` vẫn đọc được nhãn chữ đầy đủ ở 375px (không
      rút gọn badge thành chấm — §3.4)
- [ ] Xoay ngang điện thoại (667×375) không vỡ

### 6.11 Phương án đã cân nhắc và loại

| Phương án | Vì sao loại |
|---|---|
| **Không làm mobile**, khoá `min-w-[1024px]` + cuộn ngang | Phương án ở bản trước của file này. Đã bỏ theo yêu cầu: ứng dụng phải dùng được trên điện thoại |
| **Xoá breakpoint mặc định** (`--breakpoint-*: initial`) rồi khai lại 2 mốc | Cũng là phương án ở một bản trước. Đã bỏ: nó chống lại shadcn — `dialog`, `sheet`, `drawer` đều sinh ra class `sm:`, xoá `sm` là mọi component thêm sau đều phải sửa tay. Đổi lấy "kỷ luật" mà thang mặc định đã vừa khít 3 tầng bố cục |
| Tự định nghĩa thang chiều cao nút cho vùng chạm 44×44 | Ghi đè `Button` của shadcn là tự ôm việc bảo trì qua mỗi version. Dùng prop `size` sẵn có (§4.2b) |
| Xếp thẳng 3 cột thành 3 khối dọc | Đẩy cột quyết định xuống đáy trang → mọi thao tác phải cuộn hết trang. Phá NFR human-in-the-loop, không chỉ xấu |
| Tabs / segmented control để đổi giữa 3 cột | Giấu mất nội dung khi đang quyết định — mà quyết định lại **cần** nhìn nội dung. Tabs hợp với 3 khối độc lập, 3 cột này thì không độc lập |
| Bottom tab bar cho 4 mục nav | Chiếm vùng ngón cái cho việc tần suất thấp, đẩy hành động chính lên trên |
| Cuộn ngang cho `RelatedWorkTable` | Bắt swipe qua lại mới ghép được nghĩa một hàng, trong khi mỗi hàng chỉ cần đọc một lần |
| `DecisionSheet` là modal đóng được | Đóng rồi thì không còn dấu hiệu nào cho biết đang có việc chờ quyết |
| Làm mobile bằng thư viện UI riêng cho mobile | Thêm dependency ngoài STACK §8; shadcn `sheet`/`drawer` đã đủ |

**Vị trí Stepper — [QĐ] lệch mockup.** Mockup 1–4 nhét stepper vào dải "Tóm tắt sau vòng N" ở đáy
trang; mockup 5 đặt nó thành thanh ngang dưới nav. Chọn phương án của mockup 5 và áp cho **cả 5
bước**: stepper là điều hướng, phải luôn nhìn thấy được. Ở mobile lý do còn mạnh hơn — đáy màn hình
đã thuộc về `DecisionSheet`.

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

### 7.1 Một nơi duy nhất giữ ánh xạ enum → class

```
frontend/src/lib/types.ts         3 union type khai lại tay từ backend/src/contracts/ (STACK §3.1)
frontend/src/lib/status-style.ts  CARD_STATUS_STYLE · SEVERITY_STYLE · SUPPORT_LABEL_STYLE
frontend/src/lib/error-code.ts    ErrorCode → thông báo tiếng Việt
```

`status-style.ts` khai kiểu `Record<CardStatus, StatusStyle>` (và tương tự cho 2 enum kia). Nhờ vậy
**thêm một giá trị enum ở backend mà quên khai màu ở frontend là lỗi TypeScript, không phải badge
trắng lúc chạy** — đây là lý do chọn `Record` thay vì object thường hay `Map`.

Mỗi entry chứa đúng ba thứ: `label` (tiếng Việt cho UI, hoặc giữ nguyên mã cho `Severity`), `icon`
(component lucide), `className` (chuỗi Tailwind). Không chứa logic.

### 7.2 Cấm màu inline ở component

- Cấm `style={{ color: … }}`, cấm mã hex trong `.tsx`.
- Cấm class màu thô (`bg-red-50`, `text-green-600`, …) trong `app/` và `components/` — **trừ**
  `components/ui/` (shadcn sinh ra) và `lib/status-style.ts`.
- Component muốn thể hiện trạng thái thì render `<StatusChip>` / `<SeverityBadge>` / `<SupportTag>`,
  không tự nối chuỗi class.

Kiểm bằng lệnh, cùng kiểu với grep chống hardcode prompt ở STACK §1:

```bash
grep -rnE "(bg|text|border|ring|from|to)-(red|green|blue|yellow|orange|purple|violet|amber|slate|gray|zinc|emerald|sky)-[0-9]{2,3}" \
  frontend/src/app frontend/src/components --include=*.tsx | grep -v "frontend/src/components/ui/"
# → phải rỗng
```

### 7.3 Ràng buộc còn lại

| Luật | Lý do |
|---|---|
| **Viết mobile-first**: class không tiền tố = mobile, `md:`/`xl:` chồng thêm khi rộng ra | Cách Tailwind được thiết kế để dùng |
| **Bố cục cấp trang** (`WizardShell`, `Panel`, lưới cột) chỉ dùng `md:` và `xl:` | §6.1 — ba tầng. `sm:` `lg:` `2xl:` vẫn tồn tại và shadcn vẫn dùng; đây là quy ước cho code của ta, **không** phải lệnh cấm toàn repo |
| Không sửa file trong `components/ui/` để "chuẩn hoá breakpoint" | Sửa là mất khả năng chạy lại `npx shadcn add` mà không xung đột |
| Kích thước nút lấy từ prop `size` của shadcn, không tự khai chiều cao | §4.2b |
| Container query (`@container`, `@sm:`) chỉ dùng cho 3 component ở §6.8 | Hai hệ responsive song song ở tầng trang thì không đoán được cái nào thắng |
| Không đặt thông tin **chỉ** trong `:hover` / `title=` | §6.7 — cảm ứng không có hover |
| Icon dùng `lucide-react` (đi kèm shadcn, không phải dependency mới). Size: 16 trong badge/chip · 18 trong nút · 20 trong tiêu đề `Panel` · 24 trong icon tile | Giữ nhịp thị giác, tránh mỗi chỗ một cỡ |
| Chuỗi UI viết thẳng tiếng Việt trong component, **không** dựng hệ thống i18n | STACK §5 |
| Nội dung 14 mục spec render **nguyên văn tiếng Anh** do backend trả, FE không dịch | STACK §10 — dịch ở FE sẽ làm lệch cái mà verifier đã chấm |
| Sửa enum ở `backend/src/contracts/` → sửa `types.ts` **và** `status-style.ts` trong **cùng commit** | STACK §3.1 luật 2 |
| Không tự thêm hue mới ngoài 8 họ token ở §2 | Thêm hue là phá vỡ luật "đỏ/cam/vàng = có vấn đề" ở §1 |

---

## 8. Mâu thuẫn phát hiện được

| # | Mâu thuẫn | Xử lý |
|---|---|---|
| 1 | Mockup 5 gắn nhãn stepper `1.Nhập ý tưởng · 2.Làm rõ · 3.Nghiên cứu · 4.Judge · 5.Spec cuối`, nhưng tiêu đề trang của mockup 1–4 lại là `1.Nhập ý tưởng & Làm rõ · 2.Nghiên cứu & Research Gap · 3.Contribution & Kế hoạch thí nghiệm · 4.Judge & Xác nhận` — lệch một bước | Lấy đánh số của mockup 1–4 (tự nhất quán với nhau và khớp 10 bước của đề). Nhãn chốt ở `ARCHITECTURE.md` §4 |
| 2 | Mockup 1–4 đặt stepper ở đáy, mockup 5 đặt ở đầu | Chọn đầu trang cho cả 5 bước — §6 |
| 3 | Mockup 1–4 dùng nav có avatar xám không tên; mockup 5 dùng nav có chuông + avatar chữ cái + tên | Lấy nav của mockup 5 (**bỏ chuông** — không có tính năng thông báo trong 16 chức năng), vì có auth thì phải hiện được đang đăng nhập bằng tài khoản nào |
| 4 | Badge `MINOR` ở mockup 4 dùng chữ trắng trên nền vàng, không đọc được | Đổi sang chữ `ink` — §3.3 |
| 5 | Mockup 1 dùng cam cho danh sách "Vấn đề chính" (trang trí), trong khi §1 nguyên tắc 4 giữ cam riêng cho `Severity` | Đổi khối đó sang `warn` (hổ phách) |
| 6 | Kim-chỉ-nam §4 và STACK §5 (bản cũ) ghi "không cần responsive mobile, đừng tốn thời gian" | **Đã bỏ luật đó** theo yêu cầu của bạn. Responsive mobile giờ là **ràng buộc bắt buộc** — §6. Cả hai file đã được sửa; đề bài vốn không cấm, chỉ là không đòi |
| 7 | Mockup chỉ có bản desktop, không có bản mobile để đối chiếu | Toàn bộ §6 phần mobile là **[QĐ]** suy ra từ mockup + pattern chuẩn, không sao chép. Nếu giảng viên có bản mobile thì phải đối chiếu lại |
| 8 | Bản trước của file này xoá breakpoint mặc định và tự khai thang chiều cao nút 44×44 | **Đã bỏ cả hai.** Giữ nguyên hệ sinh thái Tailwind + shadcn, chỉ *tham chiếu* tới nó. Xem §6.11 hai dòng cuối |

---

## 9. Câu hỏi còn mở

- [ ] Nhãn 5 bước stepper chốt theo mockup 1–4 — cần bạn xác nhận (§8 #1). *(chờ: bạn)*
- [ ] Stepper chuyển lên đầu trang — cần bạn xác nhận (§8 #2). *(chờ: bạn)*
- [ ] `Be Vietnam Pro` qua `next/font` — nếu bạn muốn giữ đúng font của mockup thì cần biết tên font
      gốc; hiện tôi chỉ suy ra từ hình dáng chữ. *(chờ: bạn)*
- [ ] Có cần trang `Trợ giúp` thật không? Nav trong mockup có mục này nhưng nó **không** nằm trong 16
      chức năng bắt buộc. Tôi tạm coi là trang tĩnh 1 màn hình. *(chờ: bạn)*
- [ ] **`DecisionSheet` không đóng hẳn được** (§6.3) là lựa chọn cố ý nhưng khác thói quen người
      dùng. Nếu bạn thấy khó chịu khi thử thì phương án lùi là cho đóng hẳn nhưng để lại một nút nổi
      (FAB) có badge số việc chờ. *(chờ: bạn, sau khi có bản chạy)*
- [ ] Responsive làm ở phase nào? Tôi xếp vào phase 5 cùng UI polish, nhưng khung `WizardShell` +
      `DecisionSheet` phải dựng **ngay từ phase 1** — không thể bọc mobile lên sau. *(chờ: bạn)*
- [ ] Có cần hỗ trợ máy tính bảng nằm ngang (1024–1279) như một tầng riêng không? Hiện nó dùng chung
      bố cục 2 cột với tablet dọc. *(chờ: bạn)*
