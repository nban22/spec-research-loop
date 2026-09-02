# SpecResearch Loop — Hồ sơ nộp bài

**Nhóm 3 sinh viên**

| Họ và tên | MSSV | Commit trên `main` |
| --- | --- | ---: |
| Nguyễn Bá An | 22127472 | 43 |
| Nguyễn Phước Sang | 22127362 | 53 |
| Phạm Trịnh Bảo Tín | 22127485 | 54 |
| | **tổng** | **150** |

Cột commit không phải tự khai — kiểm bằng `git shortlog -sne` trên nhánh `main`. Mỗi người xuất hiện
dưới hai đến ba identity (tên máy local + địa chỉ noreply của GitHub), số ở trên đã gộp lại.
Đóng góp còn tra được ở mức nhỏ hơn commit: 33 pull request đã merge, và `Card.origin` phân biệt
`GENERATOR` / `USER` / `JUDGE_FIX` ngay trong dữ liệu sản phẩm.

**Website:** <https://dsa-bus-booking.io.vn> · **API:** <https://api.dsa-bus-booking.io.vn>  
**Video demo:** <https://www.youtube.com/watch?v=aQMGFN3kzoA>  
**Repo:** <https://github.com/nban22/spec-research-loop>  

> Mỗi sản phẩm bàn giao của §6 đề bài có **đúng một thư mục**, và **file thật nằm ngay trong thư mục
> đó** — không phải link trỏ đi nơi khác. Thư mục nào cần giải thích thì mở đầu bằng một `README.md`
> trả lời ba câu *đề đòi gì · nó nằm ở đâu · kiểm trong bao lâu*; thư mục nào chỉ cần một đường link
> (`01`, `09`) thì đúng một file `.txt`, không bắt ai mở thêm gì.
>
> Hồ sơ này đọc được **hoàn toàn độc lập với repo**: giải nén ra là chấm được, không cần clone,
> không cần chạy gì. Bản gốc của mọi file vẫn nằm ở vị trí cũ trong repo (`docs/`, `prompts/`,
> `backend/`); bản ở đây là **ảnh chụp đông cứng** tại 2026-09-03. Riêng bộ prompt có
> [MANIFEST.md](05-prompt-generator-judge/MANIFEST.md) ghi sha256 từng file, nên đối chiếu bản chụp
> với bản gốc là việc của một lệnh.

---

## Đọc trong 5 phút

Đề chốt lại bằng ba câu. Trả lời trước, chi tiết ở dưới.

### 1. Cải tiến này giải quyết vấn đề gì?

Một hệ sinh research spec bằng LLM có **hai** kiểu sai citation, khác hẳn nhau về bản chất:

| Kiểu sai | Ví dụ | Ai bắt được |
| --- | --- | --- |
| Nguồn **không tồn tại** | Trích *"Smith et al., 2023, Prompt Distillation"* — không có paper nào như vậy | Rule, 0 token |
| Nguồn có thật nhưng **không nói điều claim nói** | Trích đúng một paper rồi gán cho nó con số *"giảm 20%"* mà paper không hề có | Phải đọc abstract |

Kiểu thứ nhất bị chặn **bằng kiểu dữ liệu**: enum `Source.retrieved_from` **không tồn tại giá trị
`LLM`** — không có đường ghi nào để một paper do model nghĩ ra vào được database. Kiểu thứ hai đi
qua **Citation Verifier 5 tầng**, rẻ trước đắt sau, và chỉ một tầng gọi LLM.

### 2. Được kiểm nghiệm như thế nào?

10 ý tưởng mơ hồ cố định × **4 arm** (`B1` single-shot · `B2` no-judge · `SYS` đầy đủ ·
`SYS_NO_VERIFY` ablation). Cùng model, `temperature: 0`, cùng một `ScriptedDecisionPolicy`
deterministic cho mọi arm. Script eval **gọi thẳng service của app**, không có nhánh code riêng cho
baseline — bốn arm ghi vào cùng bộ bảng, một câu SQL tính metric cho cả bốn.

### 3. Kết quả có tốt hơn baseline không?

Có, và trên chỉ số quan trọng nhất thì khoảng cách không cãi được:

| Metric | B1 single-shot | B2 pipeline | Hướng tốt |
| --- | --- | --- | --- |
| **Citation validity** | **0,400** | **1,000** | ↑ |
| **Spec completeness (/14 mục)** | **6** | **14** | ↑ |

B1 trích 5 paper từ trí nhớ của model; tra lại bằng Semantic Scholar/OpenAlex thì **chỉ 2 cái tồn
tại — 60% là bịa**. B2 đạt 1,000 **theo cấu trúc chứ không nhờ may**: mọi nguồn của nó đến từ API
thật và mang `external_id`, nên không có gì để bịa.

**Cỡ mẫu của bảng trên là n = 1 ý tưởng × 2 arm.** Con số này được ghi ra ở đây, ở
[07-baseline/](07-baseline/), ở [08-bao-cao-danh-gia/](08-bao-cao-danh-gia/) và ở §6 của báo cáo —
không giấu ở chỗ nào. Batch đầy đủ 4 arm × 10 ý tưởng là **một lệnh, ~2 giờ máy**; hạ tầng đã chạy
được, xem [07-baseline/README.md](07-baseline/README.md).

---

## Bảng 10 sản phẩm bàn giao

| # | Hạng mục (§6 đề bài) | Thư mục | Kiểm trong |
| --- | --- | --- | --- |
| 1 | Website chạy được | [01-website-chay-duoc/](01-website-chay-duoc/) | 10 giây — mở link |
| 2 | Source code | [02-source-code/](02-source-code/) | 1 phút — `npm test` ở backend |
| 3 | Tài liệu kiến trúc | [03-tai-lieu-kien-truc/](03-tai-lieu-kien-truc/) | 2 phút — mở 1 sơ đồ |
| 4 | Dataset / tập use case | [04-dataset-use-case/](04-dataset-use-case/) | 1 phút — `ideas.json` |
| 5 | Prompt Generator + Judge | [05-prompt-generator-judge/](05-prompt-generator-judge/) | 1 phút — `MANIFEST.md` |
| 6 | Cơ chế kiểm citation / evidence | [06-co-che-kiem-citation/](06-co-che-kiem-citation/) | 3 phút — sơ đồ 5 tầng |
| 7 | Ít nhất hai baseline | [07-baseline/](07-baseline/) | 2 phút — `summary.csv` |
| 8 | Báo cáo đánh giá hệ thống | [08-bao-cao-danh-gia/](08-bao-cao-danh-gia/) | 10 phút — đọc §1–§6 |
| 9 | Video demo | [09-video-demo/](09-video-demo/) | theo độ dài video |
| 10 | Research spec hoàn chỉnh | [10-research-spec-mau/](10-research-spec-mau/) | 3 phút — mở PDF |

**16 chức năng bắt buộc → chỗ cài đặt:** [CHECKLIST-16-CHUC-NANG.md](CHECKLIST-16-CHUC-NANG.md).
Đủ 16/16, mỗi dòng có module backend và màn hình cụ thể.

---

## Cấu trúc hồ sơ

```
nop-bai/
├── README.md                      ← đang đọc
├── CHECKLIST-16-CHUC-NANG.md      16 chức năng bắt buộc → chỗ cài đặt
│
├── 01-website-chay-duoc/          LINK-WEBSITE.txt — link app, API, healthcheck
├── 02-source-code/                README — bố cục, lệnh test, lịch sử phát triển
├── 03-tai-lieu-kien-truc/         ARCHITECTURE · STACK · DESIGN_SYSTEM ·
│                                  SYSTEM_DESIGN_ANALYSIS · 2 bản đồ HTML
├── 04-dataset-use-case/           ideas.json (10 ý tưởng) · 30 cặp nhãn · label-sample.ts
├── 05-prompt-generator-judge/     prompts/ (18) · dev-log/ (83) · MANIFEST.md (sha256)
├── 06-co-che-kiem-citation/       verifier-source/ (21 file, cả test)
├── 07-baseline/                   eval-source/ (harness 4 arm) · ket-qua-do-duoc/
├── 08-bao-cao-danh-gia/           evaluation_report · deliverables_plan · handover
├── 09-video-demo/                 LINK-VIDEO.txt — link YouTube + cảnh đáng xem
└── 10-research-spec-mau/          sample_spec.pdf + .md (14 mục)
```

Ba thư mục chứa **mã nguồn thật chứ không phải mô tả**: `06` (cơ chế kiểm citation), `07` (bộ đánh
giá 4 arm), `05` (prompt đang chạy). Đó là ba deliverable mà "đọc mô tả" không thay được "đọc code".

Toàn bộ `backend/` và `frontend/` **không** chép vào đây — sản phẩm bàn giao #2 là chính repo, xem
[02-source-code/](02-source-code/).

---

## Bốn thứ đề bài đòi tường minh, và chỗ chúng được thoả bằng ràng buộc chứ không bằng lời hứa

Đây là phần đáng đọc nhất của hồ sơ. Mỗi dòng là một yêu cầu đề nói thẳng, và cách nó được ép xuống
tầng **dữ liệu** thay vì để trong prompt hoặc trong tài liệu.

| Đề đòi | Cách thoả yếu (đã loại) | Cách đã làm |
| --- | --- | --- |
| *"Judge phải đánh giá riêng trước khi xem nhận xét của nhau"* | Dặn trong prompt | 5 lời gọi song song, context sạch. `JudgeRun.input_digest` — 5 run cùng digest, `raw_output` khác nhau, `started_at` trùng ⇒ **kiểm chứng được từ database** |
| *"Mỗi nhận định phải liên kết nguồn cụ thể"* | Bảo LLM nhớ trích dẫn | `Source.retrieved_from` là enum **không có giá trị `LLM`**; nguồn chỉ vào DB từ nhánh `sources` gọi Semantic Scholar / OpenAlex / Crossref |
| *"Người dùng vẫn là người quyết định cuối cùng"* | Thêm nút xác nhận ở UI | `SpecVersion.created_by_decision_id` **NOT NULL từ v2** — không có `Decision` của người thì **không tồn tại** version mới |
| *"Gap không được tạo kiểu chưa thấy paper giống hệt"* | Nhắc trong prompt | `Card.payload` của `GAP` có 4 ô bắt buộc (`prior_work`, `limitation`, `why_it_matters`, `testable_experiment`), và J1 chấm riêng bốn ô đó |

Cùng tinh thần đó, **cơ chế mới không dừng ở gắn nhãn mà thật sự chặn**:
`POST /spec-versions/:id/export` trả `409 EXPORT_BLOCKED_UNSUPPORTED_CITATION` khi spec còn citation
`UNSUPPORTED`. Gắn nhãn là báo cáo; **chặn** mới là cơ chế.

---

## Quy mô — số đếm được, kiểm lại được

| | Số | Lệnh kiểm |
| --- | --- | --- |
| Backend TypeScript (trừ code sinh tự động) | 23.291 dòng | `find backend/src -name "*.ts" -not -path "*/generated/*" \| xargs wc -l` |
| Frontend TypeScript/TSX | 15.876 dòng | `find frontend/src -name "*.ts*" \| xargs wc -l` |
| Bộ đánh giá (`backend/eval`) | 3.066 dòng | `find backend/eval -name "*.ts" \| xargs wc -l` |
| Tài liệu (`docs/*.md`) | 7.213 dòng | `wc -l docs/*.md` |
| **Test backend** | **38 suite · 445 test · pass toàn bộ** | `cd backend && npm test` |
| Test frontend | 22 file component + 3 kịch bản Playwright E2E | `cd frontend && npm run test:component` |
| Prompt runtime | 18 file, đều có frontmatter + hash | [05-…/MANIFEST.md](05-prompt-generator-judge/MANIFEST.md) |
| Log quá trình phát triển | [83 file dev-log](05-prompt-generator-judge/dev-log/) | `ls prompts/dev-log \| wc -l` |
| Lịch sử Git | 150 commit · 33 PR đã merge | `git rev-list --count HEAD` |

Con số **445 test được chạy lại ngày 2026-09-03**, không phải chép từ lần chạy cũ.

> **Yêu cầu môi trường:** Node.js **≥ 20.9** (CI dùng 22). Trên Node 18, `vitest` của frontend không
> khởi động được (`ERR_REQUIRE_ESM`) — giới hạn của Node cũ, không phải của bộ test.

---

## Tự đánh giá — ba chỗ yếu, ghi ra trước khi bị hỏi

Ghi ở trang đầu chứ không giấu ở phụ lục, vì một báo cáo giấu giới hạn thì mọi con số còn lại đều
mất giá trị.

1. **Chưa có validation bằng người.** 30 cặp (claim, nguồn) đã được chấm mù, nhưng **do một mô hình
   khác nhà cung cấp**, ghi rõ trong `HumanCheck.note`. Đây là *đối chiếu chéo mô hình*, không phải
   *human validation*. Cho tới khi có 20 cặp người gán tay thì mọi nhãn của verifier vẫn ở mức
   "máy nói vậy". Khoảng trống này **không sửa được bằng thêm code**.
2. **Ngưỡng verifier là số chọn, không phải số đo.** `τ_low = 0,35` · `τ_high = 0,72` ·
   `conf_min = 0,70`. Dữ liệu hiện có đã cho thấy `τ_high` gần như chắc chắn phải hạ. Công cụ hiệu
   chỉnh ([`07-baseline/eval-source/calibrate.ts`](07-baseline/eval-source/calibrate.ts)) đã viết, chờ nhãn người.
3. **Không tái lập được hoàn toàn.** DeepSeek không có tham số `seed`. Thứ tái lập được là
   `temperature: 0` + prompt cố định + `prompt_hash` ghi vào **mọi** lời gọi. Đề đòi "cùng seed" —
   điều kiện này **không thoả được đầy đủ** với provider hiện tại, và không có cách vòng qua.

Ba mục này lặp lại đúng §5 của [handover.md](08-bao-cao-danh-gia/handover.md) và §5 của
[evaluation_report.md](08-bao-cao-danh-gia/evaluation_report.md) — cùng câu chữ ở cả ba nơi, không có bản
"cho người chấm đọc" và bản "cho mình biết".
