/**
 * Nhận diện một `Source` có phải bài arXiv không, và lấy ra id của nó — **hàm thuần, 0 I/O**.
 *
 * Đây là cửa vào của tầng L3b (#2). Phạm vi cố ý hẹp: **chỉ arXiv, chỉ HTML**. Lý do ở
 * `docs/evaluation_report.md` mục làn A — bóc chữ từ PDF cho ra text bẩn tới mức câu chứng cứ
 * không còn khớp nguyên văn với nguồn, mà "khớp nguyên văn" chính là thứ tầng L4b đang bảo vệ.
 *
 * Không có provider arXiv nào trong `SourceClient` (enum `SourceProvider.ARXIV` tồn tại nhưng
 * chưa ai cài). Nên đường trúng nhiều nhất **không phải** `retrieved_from`, mà là
 * `raw.externalIds.ArXiv` của Semantic Scholar — `S2_FIELDS` đã lấy `externalIds` từ đầu, dữ liệu
 * nằm sẵn trong DB, không cần thêm một lời gọi mạng nào.
 */

/** `2301.12345` hoặc `2301.12345v2` — dạng sau 04/2007. */
const ID_NEW = /^(\d{4}\.\d{4,5})(?:v(\d+))?$/;
/** `cs.CL/0112017` hoặc `math/0309136` — dạng cũ. */
const ID_OLD = /^([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v(\d+))?$/i;

/** `10.48550/arXiv.2301.12345` — DOI mà arXiv tự cấp từ 2022. */
const DOI_ARXIV = /^10\.48550\/arxiv\.(.+)$/i;

/** `arxiv.org/abs/2301.12345v2`, `/pdf/…​.pdf`, `/html/…`, `/format/…`. */
const URL_ARXIV =
  /arxiv\.org\/(?:abs|pdf|html|format)\/([^\s?#]+?)(?:\.pdf)?$/i;

export type ArxivRef = {
  /** **Không** kèm version: `2301.12345` hoặc `cs.CL/0112017`. */
  id: string;
  version: number | null;
  from: 'PROVIDER' | 'DOI' | 'URL' | 'RAW_S2' | 'RAW_OPENALEX';
};

export type ArxivDetectInput = {
  retrieved_from: string;
  external_id: string;
  doi: string | null;
  url: string | null;
  raw: unknown;
};

/**
 * Mọi ứng viên đều phải qua `ID_NEW`/`ID_OLD` mới được trả về. Không có bước này thì
 * `arxiv.org/abs/list` hay một DOI hỏng cũng thành "id arXiv", rồi tầng fetch đi tải 404 —
 * tốn một vòng HTTP cho mỗi nguồn rác.
 */
function parseId(candidate: string | null | undefined): {
  id: string;
  version: number | null;
} | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  for (const re of [ID_NEW, ID_OLD]) {
    const m = re.exec(trimmed);
    if (m) return { id: m[1], version: m[2] ? Number(m[2]) : null };
  }
  return null;
}

function fromDoi(doi: string | null): string | null {
  if (!doi) return null;
  const m = DOI_ARXIV.exec(doi.trim());
  return m ? m[1] : null;
}

function fromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = URL_ARXIV.exec(url.trim());
  return m ? m[1] : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** `raw` là `Json` chưa parse ⇒ kiểu `unknown`, phải narrow từng bước (backend/CLAUDE.md §3). */
function fromRawS2(raw: unknown): string | null {
  const root = asRecord(raw);
  const ext = asRecord(root?.externalIds);
  return asString(ext?.ArXiv) ?? asString(ext?.arxiv);
}

/**
 * OpenAlex không có field arXiv riêng — id nằm rải trong `ids.doi` và trong các `location`.
 * Quét theo thứ tự khả năng trúng giảm dần rồi dừng ở hit đầu tiên.
 */
function fromRawOpenAlex(raw: unknown): string | null {
  const root = asRecord(raw);
  if (!root) return null;

  const ids = asRecord(root.ids);
  const viaDoi = fromDoi(asString(ids?.doi));
  if (viaDoi) return viaDoi;

  const locations: unknown[] = [
    root.best_oa_location,
    root.primary_location,
    ...(Array.isArray(root.locations) ? root.locations : []),
  ];
  for (const loc of locations) {
    const l = asRecord(loc);
    if (!l) continue;
    const hit =
      fromUrl(asString(l.landing_page_url)) ?? fromUrl(asString(l.pdf_url));
    if (hit) return hit;
  }
  return null;
}

/**
 * `null` = **không phải bài arXiv**. Đây là ca thường gặp nhất (ACM/IEEE/Springer/Elsevier đều
 * trả `null`) nên bên gọi tuyệt đối không được gắn cờ chẩn đoán cho nó — xem `tryFullText`.
 */
export function detectArxivId(src: ArxivDetectInput): ArxivRef | null {
  const routes: { candidate: string | null; from: ArxivRef['from'] }[] = [
    {
      candidate: src.retrieved_from === 'ARXIV' ? src.external_id : null,
      from: 'PROVIDER',
    },
    { candidate: fromDoi(src.doi), from: 'DOI' },
    { candidate: fromUrl(src.url), from: 'URL' },
    { candidate: fromRawS2(src.raw), from: 'RAW_S2' },
    { candidate: fromRawOpenAlex(src.raw), from: 'RAW_OPENALEX' },
  ];

  for (const route of routes) {
    const parsed = parseId(route.candidate);
    if (parsed) return { ...parsed, from: route.from };
  }
  return null;
}

/**
 * Chuỗi URL thử theo thứ tự, dừng ở cái đầu tiên trả về đủ chữ.
 *
 * `arxiv.org/html/` chỉ có với bài nộp bằng LaTeX **từ 12/2023**; ar5iv phủ kho cũ nhưng snapshot
 * trễ hàng tháng. Hai nguồn bù nhau chứ không thay nhau, nên phải thử cả hai.
 */
export function fullTextUrls(
  ref: ArxivRef,
): { url: string; provider: string }[] {
  const versioned = ref.version !== null ? `${ref.id}v${ref.version}` : null;
  const urls: { url: string; provider: string }[] = [];
  if (versioned) {
    urls.push({
      url: `https://arxiv.org/html/${versioned}`,
      provider: 'ARXIV_HTML',
    });
  }
  urls.push({
    url: `https://arxiv.org/html/${ref.id}`,
    provider: 'ARXIV_HTML',
  });
  // arXiv render HTML **theo từng version**; URL không kèm version trượt khi chỉ v1 được render.
  urls.push({
    url: `https://arxiv.org/html/${ref.id}v1`,
    provider: 'ARXIV_HTML',
  });
  urls.push({
    url: `https://ar5iv.labs.arxiv.org/html/${ref.id}`,
    provider: 'AR5IV',
  });
  return urls;
}
