import { CardLinkService } from './card-link.service';

/**
 * Bốn thứ đáng khoá lại:
 *
 * 1. **Tài nguyên của user khác trả 404, không 403** — và quyền phải kiểm bằng `where` join qua
 *    `Project`, không phải bằng một câu `if` sau khi đã đọc xong dữ liệu.
 * 2. **Cặp nối tay là "chưa kiểm"**: `verifier_run_id: null`, `support_label: WEAK`. Đây là chỗ
 *    dễ sai nhất — `WEAK` nghĩa là *đã kiểm và thấy yếu*, không phải *chưa kiểm*.
 * 3. **Thả trùng không được là lỗi**: kéo thả thì thả hụt rồi thả lại là chuyện thường.
 * 4. **Nguồn phải cùng dự án với thẻ** — nối chéo dự án là hợp lệ về khoá ngoại, vô nghĩa về
 *    nghiệp vụ.
 */
describe('CardLinkService', () => {
  type Found = { card: unknown; source: unknown; link: unknown };

  const build = (found: Partial<Found> = {}) => {
    const state = {
      card:
        'card' in found
          ? found.card
          : { id: 'c-1', spec_version: { project_id: 'p-1' } },
      source: 'source' in found ? found.source : { id: 's-1' },
      link: 'link' in found ? found.link : { id: 'cs-1' },
    };

    const prisma = {
      card: {
        findFirst: jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue(state.card),
        delete: jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue({ id: 'c-1' }),
      },
      source: {
        findFirst: jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue(state.source),
      },
      cardSource: {
        findFirst: jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue(state.link),
        upsert: jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue({ id: 'cs-1', card_id: 'c-1', source_id: 's-1' }),
        delete: jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue({ id: 'cs-1' }),
      },
    };
    return { prisma, service: new CardLinkService(prisma as never) };
  };

  describe('linkSource', () => {
    it('cặp nối tay là CHƯA KIỂM: verifier_run_id null, không phải đã chấm là yếu', async () => {
      const { prisma, service } = build();
      await service.linkSource('c-1', 'u-1', { source_id: 's-1' });

      const arg = prisma.cardSource.upsert.mock.calls[0][0] as {
        create: { support_label: string; verifier_run_id: string | null };
        update: Record<string, unknown>;
      };
      expect(arg.create.verifier_run_id).toBeNull();
      expect(arg.create.support_label).toBe('WEAK');
      // Nối lại cặp đã có KHÔNG được xoá kết quả kiểm chứng đang có của nó.
      expect(arg.update).toEqual({});
    });

    it('kiểm quyền bằng where join qua Project, không đọc user_id từ tham số', async () => {
      const { prisma, service } = build();
      await service.linkSource('c-1', 'u-1', { source_id: 's-1' });
      expect(prisma.card.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1', spec_version: { project: { user_id: 'u-1' } } },
        }),
      );
    });

    it('thẻ của user khác trả 404, không 403', async () => {
      const { service } = build({ card: null });
      await expect(
        service.linkSource('c-1', 'u-khac', { source_id: 's-1' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('nguồn khác dự án thì từ chối, không nối chéo dự án', async () => {
      const { prisma, service } = build({ source: null });
      await expect(
        service.linkSource('c-1', 'u-1', { source_id: 's-9' }),
      ).rejects.toMatchObject({
        status: 404,
      });
      // Điều kiện lọc phải gồm project_id của chính thẻ đó.
      expect(prisma.source.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's-9', project_id: 'p-1' } }),
      );
    });

    it('thả trùng một nguồn vào cùng một thẻ không phải là lỗi', async () => {
      const { prisma, service } = build();
      await service.linkSource('c-1', 'u-1', { source_id: 's-1' });
      await service.linkSource('c-1', 'u-1', { source_id: 's-1' });
      expect(prisma.cardSource.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('unlinkSource', () => {
    it('gỡ được liên kết của chính mình', async () => {
      const { prisma, service } = build();
      await expect(service.unlinkSource('cs-1', 'u-1')).resolves.toEqual({
        id: 'cs-1',
        deleted: true,
      });
      expect(prisma.cardSource.delete).toHaveBeenCalledWith({
        where: { id: 'cs-1' },
      });
    });

    it('liên kết của user khác trả 404 và KHÔNG gọi delete', async () => {
      const { prisma, service } = build({ link: null });
      await expect(
        service.unlinkSource('cs-1', 'u-khac'),
      ).rejects.toMatchObject({ status: 404 });
      expect(prisma.cardSource.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteCard', () => {
    it('xoá thẻ của chính mình', async () => {
      const { prisma, service } = build();
      await expect(service.deleteCard('c-1', 'u-1')).resolves.toEqual({
        id: 'c-1',
        deleted: true,
      });
      expect(prisma.card.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });

    it('KHÔNG tự xoá CardSource con — để cascade của schema lo', async () => {
      const { prisma, service } = build();
      await service.deleteCard('c-1', 'u-1');
      expect(prisma.cardSource.delete).not.toHaveBeenCalled();
    });

    it('thẻ của user khác trả 404 và KHÔNG gọi delete', async () => {
      const { prisma, service } = build({ card: null });
      await expect(service.deleteCard('c-1', 'u-khac')).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.card.delete).not.toHaveBeenCalled();
    });
  });
});
