/**
 * Bảng tra hạng nơi công bố — **tĩnh, 0 token, 0 I/O**.
 *
 * Không gọi API xếp hạng nào (CORE, Scimago) vì hai lý do: chúng không có endpoint mở ổn định,
 * và một bảng tra tĩnh **giải thích được** — bị hỏi "vì sao NeurIPS 1.0 mà workshop 0.5" thì
 * câu trả lời nằm ngay trong file này, không phải "API nói thế".
 *
 * Đây là danh sách **không đầy đủ và cố tình như vậy**: venue không có trong bảng nhận điểm nền
 * `UNRANKED_SCORE` chứ không nhận 0. Vắng mặt ở đây nghĩa là "không biết", không phải "kém".
 */

/** Venue không tra được ⇒ điểm nền. Không phải 0: thiếu thông tin ≠ bằng chứng xấu. */
export const UNRANKED_SCORE = 0.45;

/** Bản tiền ấn chưa qua phản biện — thấp hơn nền, nhưng không phải 0. */
export const PREPRINT_SCORE = 0.3;

type VenueRule = { pattern: RegExp; score: number; label: string };

/**
 * Hit đầu tiên thắng, nên thứ tự ở đây là luật chứ không phải trang trí: `workshop` đứng **trước**
 * bảng hội nghị, còn `arxiv` đứng **sau** nó. Cả hai chiều đều có test giữ.
 */
const VENUE_RULES: VenueRule[] = [
  // ── Workshop / short paper / demo. **Phải đứng đầu**: bài workshop của ACL không phải bài
  //    ACL main track, mà hit đầu tiên thắng nên luật này phải chặn trước bảng hội nghị.
  {
    pattern: /\bworkshop\b|\bshort paper\b|\bdemo(?:nstration)? track\b/i,
    score: 0.5,
    label: 'workshop',
  },
  // ── Hội nghị hạng A* của ML/AI ────────────────────────────────────────────
  {
    pattern: /\bneurips\b|\bneural information processing systems\b|\bnips\b/i,
    score: 1,
    label: 'NeurIPS',
  },
  {
    pattern: /\bicml\b|\binternational conference on machine learning\b/i,
    score: 1,
    label: 'ICML',
  },
  {
    pattern: /\biclr\b|\blearning representations\b/i,
    score: 1,
    label: 'ICLR',
  },
  { pattern: /\baaai\b/i, score: 0.9, label: 'AAAI' },
  { pattern: /\bijcai\b/i, score: 0.9, label: 'IJCAI' },
  // ── NLP ───────────────────────────────────────────────────────────────────
  {
    pattern: /\bacl\b|\bassociation for computational linguistics\b/i,
    score: 1,
    label: 'ACL',
  },
  {
    pattern: /\bemnlp\b|\bempirical methods in natural language\b/i,
    score: 1,
    label: 'EMNLP',
  },
  { pattern: /\bnaacl\b/i, score: 0.9, label: 'NAACL' },
  { pattern: /\bcoling\b/i, score: 0.8, label: 'COLING' },
  { pattern: /\beacl\b/i, score: 0.8, label: 'EACL' },
  {
    pattern: /\btacl\b|\btransactions of the association for computational\b/i,
    score: 0.95,
    label: 'TACL',
  },
  // ── Thị giác máy tính ─────────────────────────────────────────────────────
  {
    pattern: /\bcvpr\b|\bcomputer vision and pattern recognition\b/i,
    score: 1,
    label: 'CVPR',
  },
  { pattern: /\biccv\b/i, score: 1, label: 'ICCV' },
  { pattern: /\beccv\b/i, score: 0.95, label: 'ECCV' },
  { pattern: /\bwacv\b/i, score: 0.75, label: 'WACV' },
  { pattern: /\bbmvc\b/i, score: 0.7, label: 'BMVC' },
  // ── Truy hồi thông tin & khai phá dữ liệu ─────────────────────────────────
  { pattern: /\bsigir\b/i, score: 1, label: 'SIGIR' },
  {
    pattern: /\bkdd\b|\bknowledge discovery and data mining\b/i,
    score: 1,
    label: 'KDD',
  },
  { pattern: /\bwsdm\b/i, score: 0.85, label: 'WSDM' },
  { pattern: /\bcikm\b/i, score: 0.8, label: 'CIKM' },
  { pattern: /\brecsys\b/i, score: 0.85, label: 'RecSys' },
  {
    pattern: /\bthe web conference\b|\bwww\b/i,
    score: 0.9,
    label: 'TheWebConf',
  },
  // ── Hệ thống, cơ sở dữ liệu, an ninh ──────────────────────────────────────
  { pattern: /\bosdi\b/i, score: 1, label: 'OSDI' },
  { pattern: /\bsosp\b/i, score: 1, label: 'SOSP' },
  { pattern: /\bnsdi\b/i, score: 0.95, label: 'NSDI' },
  { pattern: /\busenix\b/i, score: 0.9, label: 'USENIX' },
  { pattern: /\bmlsys\b/i, score: 0.85, label: 'MLSys' },
  { pattern: /\bsigmod\b/i, score: 1, label: 'SIGMOD' },
  { pattern: /\bvldb\b/i, score: 1, label: 'VLDB' },
  { pattern: /\bicde\b/i, score: 0.9, label: 'ICDE' },
  {
    pattern: /\bieee s&p\b|\boakland\b|\bsymposium on security and privacy\b/i,
    score: 1,
    label: 'IEEE S&P',
  },
  {
    pattern: /\bccs\b|\bcomputer and communications security\b/i,
    score: 0.95,
    label: 'CCS',
  },
  { pattern: /\bndss\b/i, score: 0.9, label: 'NDSS' },
  // ── Công nghệ phần mềm & HCI ──────────────────────────────────────────────
  {
    pattern: /\bicse\b|\binternational conference on software engineering\b/i,
    score: 1,
    label: 'ICSE',
  },
  {
    pattern: /\bfse\b|\bfoundations of software engineering\b/i,
    score: 0.95,
    label: 'FSE',
  },
  {
    pattern: /\base\b|\bautomated software engineering\b/i,
    score: 0.85,
    label: 'ASE',
  },
  {
    pattern: /\bchi\b|\bhuman factors in computing systems\b/i,
    score: 1,
    label: 'CHI',
  },
  { pattern: /\bcscw\b/i, score: 0.85, label: 'CSCW' },
  { pattern: /\buist\b/i, score: 0.85, label: 'UIST' },
  // ── Tạp chí ───────────────────────────────────────────────────────────────
  {
    pattern: /\btpami\b|\bpattern analysis and machine intelligence\b/i,
    score: 1,
    label: 'TPAMI',
  },
  {
    pattern: /\bjmlr\b|\bjournal of machine learning research\b/i,
    score: 1,
    label: 'JMLR',
  },
  { pattern: /\bnature\b/i, score: 1, label: 'Nature' },
  { pattern: /\bscience\b(?!\s+of\b)/i, score: 0.95, label: 'Science' },
  {
    pattern: /\bcomputational linguistics\b/i,
    score: 0.9,
    label: 'Computational Linguistics',
  },
  {
    pattern: /\btois\b|\btkde\b|\btse\b|\btoplas\b|\btocs\b/i,
    score: 0.9,
    label: 'ACM/IEEE Transactions',
  },
  // ── Bản tiền ấn. **Phải đứng cuối** — bài hội nghị mirror lên arXiv vẫn là bài hội nghị. ──
  {
    pattern: /\barxiv\b|\bcorr\b|\bpreprint\b|\bbiorxiv\b|\bssrn\b/i,
    score: PREPRINT_SCORE,
    label: 'bản tiền ấn',
  },
];

export type VenueRank = { score: number; label: string | null };

/**
 * `label = null` ⇒ không tra được, điểm nền. Gọi bên nào cũng phải phân biệt hai ca này:
 * "không tra được" là câu giải thích khác hẳn "là bản tiền ấn".
 */
export function rankVenue(venue: string | null | undefined): VenueRank {
  if (!venue || venue.trim().length === 0) {
    return { score: UNRANKED_SCORE, label: null };
  }
  for (const rule of VENUE_RULES) {
    if (rule.pattern.test(venue))
      return { score: rule.score, label: rule.label };
  }
  return { score: UNRANKED_SCORE, label: null };
}
