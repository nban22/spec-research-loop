import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';
import type { CardType, SupportLabel } from '../generated/prisma/enums';

/**
 * Phân tích lỗi trực quan — issue #19 (làn C).
 *
 * Ràng buộc như mọi thứ trong `analytics/`: **không một lệnh ghi DB nào**, không gọi LLM.
 *
 * ## Một giới hạn của dữ liệu, phải nói ra chứ không giấu
 *
 * `CardSource.verifier_run_id` bị **ghi đè** mỗi lần verifier chạy
 * (`verifier.service.ts:140-150` gọi `cardSource.update`), nên dữ liệu **mức từng cặp**
 * (`flags`, `support_label`, `similarity` của mỗi cặp) chỉ còn của **lần chạy gần nhất**.
 * Lần chạy cũ không phục dựng lại được ở mức cặp.
 *
 * Ngược lại, `VerifierRun` giữ nguyên `config` · `label_counts` · `units_total` · `units_l4`
 * cho **từng** lần chạy.
 *
 * ⇒ Màn hình này vì thế có hai tầng khác nhau về độ phân giải, và UI phải nói rõ:
 *
 * | Tầng | Nguồn | Phạm vi thời gian |
 * | --- | --- | --- |
 * | Phân bố cờ × loại thẻ · ma trận nhãn × loại thẻ | `CardSource` | **chỉ lần chạy gần nhất** |
 * | So sánh trước/sau khi đổi ngưỡng | `VerifierRun` | **mọi lần chạy** |
 *
 * Trình bày ma trận cặp như thể nó là của một lần chạy cụ thể trong quá khứ sẽ là nói dối
 * bằng giao diện.
 */

/** 7 cờ chẩn đoán của verifier — khai lại để cột luôn đủ 7 dòng kể cả khi cờ đó chưa xuất hiện. */
const VERIFIER_FLAGS = [
  'SOURCE_NOT_FOUND',
  'EMPTY_ABSTRACT',
  'STALE_SOURCE',
  'NUMBER_NOT_IN_SOURCE',
  'FABRICATED_QUOTE',
  'DOI_UNVERIFIED',
  'LLM_UNAVAILABLE',
] as const;

const SUPPORT_LABELS = ['SUPPORTED', 'WEAK', 'UNSUPPORTED'] as const;

/**
 * Hình dạng một cặp (thẻ, nguồn) sau `select`. Khai tường minh vì nhánh "dự án chưa có version"
 * trả mảng rỗng — để `[]` trần thì TypeScript suy ra `never[]` và mọi truy cập trường sau đó
 * đều báo lỗi.
 */
type PairRow = {
  support_label: SupportLabel;
  flags: unknown;
  override_reason: string | null;
  card: { type: CardType };
};

/** `flags` là cột `Json?`; Prisma trả `unknown`, nên phải thu hẹp chứ không ép kiểu. */
function readFlags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((f): f is string => typeof f === 'string');
}

/** `label_counts` cũng là `Json`. Thiếu khoá nào thì coi là 0, không phải `undefined`. */
function readLabelCounts(value: unknown): Record<SupportLabel, number> {
  const out = { SUPPORTED: 0, WEAK: 0, UNSUPPORTED: 0 };
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    for (const k of SUPPORT_LABELS) {
      if (typeof v[k] === 'number') out[k] = v[k];
    }
  }
  return out;
}

/** Chỉ lấy các khoá ngưỡng đã biết ra khỏi `config`, để hiện thành cột so sánh được. */
function readThresholds(value: unknown): Record<string, number | null> {
  const keys = [
    'tau_low',
    'tau_high',
    'conf_min',
    'title_match',
    'stale_years',
  ];
  const out: Record<string, number | null> = {};
  const v =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  for (const k of keys) out[k] = typeof v[k] === 'number' ? v[k] : null;
  return out;
}

@Injectable()
export class ErrorAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async errorAnalysis(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, user_id: userId },
      select: { id: true, title: true, current_spec_version_id: true },
    });
    if (!project) throw AppError.notFound('Project not found.');

    const [runs, pairs] = await Promise.all([
      this.prisma.verifierRun.findMany({
        where: { spec_version: { project_id: projectId } },
        select: {
          id: true,
          created_at: true,
          config: true,
          units_total: true,
          units_l4: true,
          label_counts: true,
          spec_version: { select: { id: true, version_no: true } },
        },
        orderBy: { created_at: 'asc' },
      }),
      project.current_spec_version_id
        ? this.prisma.cardSource.findMany({
            where: {
              card: { spec_version_id: project.current_spec_version_id },
            },
            select: {
              support_label: true,
              flags: true,
              override_reason: true,
              card: { select: { type: true } },
            },
          })
        : Promise.resolve<PairRow[]>([]),
    ]);

    return {
      project: { id: project.id, title: project.title },
      /**
       * Mỗi lần chạy một dòng, kèm bộ ngưỡng của **chính lần đó** — đây là thứ làm cho việc
       * so sánh trước/sau khi đổi ngưỡng có nghĩa (`thresholds.ts` chép `config` vào mỗi run
       * đúng để phục vụ chuyện này).
       */
      runs: runs.map((r) => {
        const counts = readLabelCounts(r.label_counts);
        const total = counts.SUPPORTED + counts.WEAK + counts.UNSUPPORTED;
        return {
          id: r.id,
          version_no: r.spec_version.version_no,
          created_at: r.created_at,
          units_total: r.units_total,
          units_l4: r.units_l4,
          /** Tỉ lệ unit phải xuống tầng LLM — con số đắt tiền nhất của verifier. */
          l4_ratio: r.units_total > 0 ? r.units_l4 / r.units_total : null,
          label_counts: counts,
          unsupported_ratio: total > 0 ? counts.UNSUPPORTED / total : null,
          thresholds: readThresholds(r.config),
        };
      }),
      /** Ảnh chụp **hiện tại**, không phải của một lần chạy trong quá khứ — xem docblock. */
      current: {
        spec_version_id: project.current_spec_version_id,
        pairs_total: pairs.length,
        flag_by_card_type: this.flagMatrix(pairs),
        label_by_card_type: this.labelMatrix(pairs),
        overridden: pairs.filter((p) => p.override_reason !== null).length,
      },
    };
  }

  /**
   * Cờ × loại thẻ. Một cặp có thể mang **nhiều** cờ cùng lúc, nên tổng các ô lớn hơn số cặp —
   * đây là bảng đếm lần xuất hiện, không phải bảng phân hoạch.
   */
  private flagMatrix(
    pairs: { flags: unknown; card: { type: CardType } }[],
  ): { flag: string; total: number; by_type: Record<string, number> }[] {
    return VERIFIER_FLAGS.map((flag) => {
      const by_type: Record<string, number> = {};
      let total = 0;
      for (const p of pairs) {
        if (!readFlags(p.flags).includes(flag)) continue;
        by_type[p.card.type] = (by_type[p.card.type] ?? 0) + 1;
        total += 1;
      }
      return { flag, total, by_type };
    });
  }

  /** Nhãn × loại thẻ — mỗi cặp rơi vào đúng một ô, nên tổng bằng số cặp. */
  private labelMatrix(
    pairs: { support_label: SupportLabel; card: { type: CardType } }[],
  ): { label: SupportLabel; total: number; by_type: Record<string, number> }[] {
    return SUPPORT_LABELS.map((label) => {
      const by_type: Record<string, number> = {};
      let total = 0;
      for (const p of pairs) {
        if (p.support_label !== label) continue;
        by_type[p.card.type] = (by_type[p.card.type] ?? 0) + 1;
        total += 1;
      }
      return { label, total, by_type };
    });
  }
}
