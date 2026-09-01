import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';

/**
 * Ba lệnh ghi mà bản đồ claim–evidence kéo thả (#15) cần: **nối** một nguồn vào thẻ, **gỡ** một
 * liên kết, và **xoá** một thẻ.
 *
 * Vì sao là module riêng chứ không thêm vào `spec/` hay `sources/`: cả hai thư mục đó nằm ngoài
 * phạm vi sở hữu của làn C (#23). Đặt ở đây thì phần vượt ranh giới gói gọn trong ba file mới
 * cộng **một dòng** thêm vào cuối `app.module.ts` — người review sở hữu vùng kia xem hết trong
 * vài phút, và nếu không đồng ý thì revert đúng phần này, không đụng gì khác.
 *
 * Ba việc này là **thao tác tay của người dùng**, không phải một bước của pipeline: chúng không
 * gọi LLM, không sinh `SpecVersion` mới, không ghi `DecisionLog`. Chúng sửa thẳng bản nháp đang
 * mở — cùng tinh thần với `PATCH /cards/:id` đã có.
 */

export const linkSourceSchema = z.object({
  source_id: z.string().uuid(),
});
export type LinkSourceInput = z.infer<typeof linkSourceSchema>;

@Injectable()
export class CardLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nối một nguồn vào thẻ.
   *
   * `verifier_run_id: null` là chỗ quan trọng nhất của hàm này. Nó nghĩa là **"chưa kiểm"**, khác
   * hẳn `support_label: WEAK` nghĩa là *"đã kiểm và thấy yếu"* — phân biệt đó lấy theo tiền lệ ở
   * `decision.service.ts:625-627`. Cặp do người dùng nối tay phải nằm trong hàng chờ verifier;
   * gắn cho nó một `verifier_run_id` nào đó là nói dối rằng nó đã qua kiểm chứng.
   *
   * Nguồn và thẻ phải **thuộc cùng một dự án**. Không kiểm điều này thì người dùng nối được thẻ
   * của dự án A với nguồn của dự án B — hợp lệ về khoá ngoại, vô nghĩa về nghiệp vụ, và làm
   * verifier chấm một cặp không bao giờ nên tồn tại.
   */
  async linkSource(cardId: string, userId: string, input: LinkSourceInput) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, spec_version: { project: { user_id: userId } } },
      select: { id: true, spec_version: { select: { project_id: true } } },
    });
    if (!card) throw AppError.notFound('Card not found.');

    const source = await this.prisma.source.findFirst({
      where: { id: input.source_id, project_id: card.spec_version.project_id },
      select: { id: true },
    });
    if (!source)
      throw AppError.notFound('That source was not found in this project.');

    /**
     * `upsert` chứ không `create`: `UNIQUE(card_id, source_id)` biến việc thả trùng một nguồn
     * vào cùng một thẻ thành lỗi 500. Mà kéo thả thì thả trùng là chuyện thường — người dùng
     * thả hụt rồi thả lại. Idempotent ở đây là **hành vi đúng**, không phải khoan dung.
     *
     * Nhánh `update` cố ý **rỗng**: nối lại một cặp đã có không được phép xoá kết quả kiểm chứng
     * đang có của nó.
     */
    const link = await this.prisma.cardSource.upsert({
      where: {
        card_id_source_id: { card_id: cardId, source_id: input.source_id },
      },
      create: {
        card_id: cardId,
        source_id: input.source_id,
        support_label: 'WEAK',
        verifier_run_id: null,
      },
      update: {},
      select: {
        id: true,
        card_id: true,
        source_id: true,
        support_label: true,
        similarity: true,
        evidence_sentence: true,
        flags: true,
        verifier_run_id: true,
      },
    });
    return link;
  }

  /**
   * Gỡ một liên kết claim–nguồn. Xoá cứng.
   *
   * Không xoá mềm: `CardSource` không có cột trạng thái xoá, mà thêm cột là sửa model đang có —
   * luật chung 2 của #23 cấm. Và một liên kết bị gỡ thì không còn nghĩa gì để giữ lại: lịch sử
   * quyết định đã nằm ở `DecisionLog`, không ở bảng này.
   */
  async unlinkSource(cardSourceId: string, userId: string) {
    const link = await this.prisma.cardSource.findFirst({
      where: {
        id: cardSourceId,
        card: { spec_version: { project: { user_id: userId } } },
      },
      select: { id: true },
    });
    if (!link) throw AppError.notFound('Link not found.');

    await this.prisma.cardSource.delete({ where: { id: cardSourceId } });
    return { id: cardSourceId, deleted: true };
  }

  /**
   * Xoá một thẻ. `onDelete: Cascade` trong schema lo phần `CardSource` con — không tự xoá tay,
   * vì làm tay thì hai đường xoá (tay và cascade) sẽ lệch nhau ngay lần đầu ai thêm bảng con mới.
   */
  async deleteCard(cardId: string, userId: string) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, spec_version: { project: { user_id: userId } } },
      select: { id: true },
    });
    if (!card) throw AppError.notFound('Card not found.');

    await this.prisma.card.delete({ where: { id: cardId } });
    return { id: cardId, deleted: true };
  }
}
