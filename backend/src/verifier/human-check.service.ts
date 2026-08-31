import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';
import { SupportLabel } from '../contracts/enums';

/**
 * Gán nhãn tay cho từng cặp claim–nguồn, để `eval/calibrate.ts` có dữ liệu hiệu chỉnh ngưỡng (#4).
 *
 * Bảng `HumanCheck` đã nằm trong `schema.prisma` từ đầu nhưng **chưa có một dòng code nào đọc hay
 * ghi nó**, và `thresholds.ts` thì tự thú rằng 0,35 / 0,72 / 0,7 *"là ước đoán, không phải số đo"*.
 * File này là chỗ nối hai đầu đó lại.
 *
 * **Chấm mù là điều kiện sống còn của issue này.** `labelQueue` tuyệt đối không được trả
 * `support_label`, `similarity`, `entailment`, `confidence`, `evidence_sentence` hay `flags` —
 * người chấm nhìn thấy nhãn máy thì phép đo chỉ còn là "người có đồng ý với chính mình không".
 * Vì thế `select` ở đây liệt kê **tường minh**, không dùng `include` cho tiện.
 */

export type LabelQueueItem = {
  card_source_id: string;
  claim_title: string;
  claim_body: string;
  source_title: string;
  source_year: number | null;
  source_abstract: string;
};

export type LabelProgress = {
  /** Đã gán trong **version này** — con số cho thanh tiến độ trên màn hình. */
  labelled: number;
  remaining: number;
  /**
   * Đã gán trên **toàn bộ bảng** `HumanCheck`. Đây mới là con số `eval/calibrate.ts` cần: lưới
   * ngưỡng quét trên mọi cặp đã gán, không riêng một version.
   */
  labelled_total: number;
  /** Cỡ mẫu tối thiểu #4 đặt ra. Dưới mức này thì `calibrate.ts` không đáng tin. */
  target: number;
};

export const HUMAN_CHECK_TARGET = 30;

@Injectable()
export class HumanCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async queue(specVersionId: string): Promise<{
    items: LabelQueueItem[];
    progress: LabelProgress;
  }> {
    const done = await this.prisma.humanCheck.findMany({
      select: { card_source_id: true },
    });
    const doneIds = new Set(done.map((d) => d.card_source_id));

    const rows: {
      id: string;
      card: { title: string; body: string };
      source: { title: string; year: number | null; abstract: string | null };
    }[] = await this.prisma.cardSource.findMany({
      where: { card: { spec_version_id: specVersionId } },
      // Tường minh và **cố ý thiếu** mọi trường nhãn máy — xem docblock đầu file.
      select: {
        id: true,
        card: { select: { title: true, body: true } },
        source: { select: { title: true, year: true, abstract: true } },
      },
      orderBy: { id: 'asc' },
    });

    const items = rows
      .filter((r) => !doneIds.has(r.id))
      .map((r) => ({
        card_source_id: r.id,
        claim_title: r.card.title,
        claim_body: r.card.body,
        source_title: r.source.title,
        source_year: r.source.year,
        source_abstract: r.source.abstract ?? '',
      }));

    return {
      items,
      progress: {
        labelled: rows.filter((r) => doneIds.has(r.id)).length,
        remaining: items.length,
        labelled_total: doneIds.size,
        target: HUMAN_CHECK_TARGET,
      },
    };
  }

  /**
   * Ghi nhãn người. `auto_label` đọc **ở server** ngay lúc ghi — client không bao giờ gửi lên và
   * không bao giờ nhìn thấy nó trước đó.
   */
  async record(
    cardSourceId: string,
    userId: string,
    humanLabel: SupportLabel,
    note: string | null,
  ): Promise<{ match: boolean }> {
    // Tài nguyên của user khác trả **404**, không phải 403 (STACK §11.3 luật 2).
    const pair = await this.prisma.cardSource.findFirst({
      where: {
        id: cardSourceId,
        card: { spec_version: { project: { user_id: userId } } },
      },
      select: { support_label: true },
    });
    if (!pair) throw AppError.notFound('Không tìm thấy cặp khẳng định–nguồn.');

    const match = pair.support_label === humanLabel;
    const existing = await this.prisma.humanCheck.findFirst({
      where: { card_source_id: cardSourceId },
      select: { id: true },
    });

    const data = {
      human_label: humanLabel,
      auto_label: pair.support_label,
      match,
      note,
    };
    if (existing) {
      await this.prisma.humanCheck.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.humanCheck.create({
        data: { card_source_id: cardSourceId, ...data },
      });
    }
    return { match };
  }

  /** Dùng cho metric `evidence_precision_human` của #6. `null` = chưa gán nhãn cặp nào. */
  async precisionForVersion(specVersionId: string): Promise<number | null> {
    const rows = await this.prisma.cardSource.findMany({
      where: { card: { spec_version_id: specVersionId } },
      select: { id: true },
    });
    if (rows.length === 0) return null;
    const checks = await this.prisma.humanCheck.findMany({
      where: { card_source_id: { in: rows.map((r) => r.id) } },
      select: { match: true },
    });
    if (checks.length === 0) return null;
    return checks.filter((c) => c.match).length / checks.length;
  }
}
