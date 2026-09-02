import { titleSimilarity } from '../common/text';
import type { Severity } from '../generated/prisma/enums';

export type RawIssue = {
  id: string;
  judgeKey: string;
  title: string;
  severity: Severity;
  targetCardId: string | null;
};

export type Group = {
  canonicalTitle: string;
  maxSeverity: Severity;
  judgeKeys: string[];
  issueIds: string[];
  targetCardId: string | null;
  /**
   * Bậc (đã qua `rankOf`) của issue đang giữ ngôi `maxSeverity`. **Nội bộ của phép gộp**, không
   * ghi xuống DB — nó chỉ tồn tại để phép so không phải suy ngược bậc từ `maxSeverity`, vốn sẽ
   * mất hiệu chỉnh của #44.
   */
  winnerRank: number;
};

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  MAJOR: 2,
  MINOR: 1,
};
const TITLE_THRESHOLD = 0.7;

/**
 * "Nhóm mức độ": CRITICAL và MAJOR đều là *chặn*, MINOR là *không chặn*. Gộp theo nhóm chứ không
 * theo giá trị tuyệt đối, vì hai judge thường mô tả cùng một lỗi mà chấm lệch một bậc.
 */
function bucket(s: Severity): 'blocking' | 'minor' {
  return s === 'MINOR' ? 'minor' : 'blocking';
}

/**
 * Gộp issue **bằng rule deterministic, không bằng LLM** (SYSTEM_DESIGN_ANALYSIS §4.4 #3).
 * Lý do: `agreement_count` là con số đi vào báo cáo — F5 hai lần phải ra một kết quả. Gộp bằng LLM
 * thì mỗi lần render một số khác và NFR-JDG-6 vỡ.
 *
 * Dùng lại **đúng** hàm so title của verifier L0 và của khử trùng nguồn: một hàm, ba chỗ gọi.
 *
 * Đánh đổi đã biết: rule bỏ sót những cặp diễn đạt khác nhau hoàn toàn, nên `agreement_count`
 * là **cận dưới** của đồng thuận thật. Phải ghi vào báo cáo.
 */
/**
 * Bậc dùng để chọn **ai thắng nhóm**. Mặc định là bậc thô.
 *
 * Làn B · #44 truyền vào bậc **đã hiệu chỉnh theo từng judge** (liên tục), để một judge quen chấm
 * nặng tay không tự động quyết mức của mọi nhóm nó tham gia. `maxSeverity` vẫn lưu **mức thô của
 * người thắng** — không mức nào bị bịa ra, và `Issue.severity` không bị sửa.
 */
export type RankOf = (issue: RawIssue) => number;

const rawRank: RankOf = (i) => SEVERITY_RANK[i.severity];

export function groupIssues(
  issues: RawIssue[],
  rankOf: RankOf = rawRank,
): Group[] {
  const groups: Group[] = [];

  for (const issue of issues) {
    const match = groups.find((g) => {
      if (g.targetCardId !== issue.targetCardId) return false;
      if (bucket(g.maxSeverity) !== bucket(issue.severity)) return false;
      return titleSimilarity(g.canonicalTitle, issue.title) >= TITLE_THRESHOLD;
    });

    if (match) {
      match.issueIds.push(issue.id);
      if (!match.judgeKeys.includes(issue.judgeKey))
        match.judgeKeys.push(issue.judgeKey);
      // So bằng `rankOf`, **không** bằng `SEVERITY_RANK[match.maxSeverity]`: mức của nhóm là mức
      // thô của người thắng, còn phép so phải dùng bậc đã hiệu chỉnh của **người đang giữ ngôi**.
      // Lấy bậc thô của `match.maxSeverity` là mất luôn hiệu chỉnh ngay sau lần gán đầu tiên.
      if (rankOf(issue) > match.winnerRank) {
        match.maxSeverity = issue.severity;
        match.canonicalTitle = issue.title;
        match.winnerRank = rankOf(issue);
      }
    } else {
      // Không khớp thì để thành nhóm riêng — thà nhiều nhóm còn hơn nhóm sai.
      groups.push({
        canonicalTitle: issue.title,
        maxSeverity: issue.severity,
        winnerRank: rankOf(issue),
        judgeKeys: [issue.judgeKey],
        issueIds: [issue.id],
        targetCardId: issue.targetCardId,
      });
    }
  }

  return groups.sort(
    (a, b) =>
      SEVERITY_RANK[b.maxSeverity] - SEVERITY_RANK[a.maxSeverity] ||
      b.judgeKeys.length - a.judgeKeys.length,
  );
}
