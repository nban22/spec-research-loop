import { DebiasController } from './debias.controller';

/**
 * #43 — đường bật cờ. Test này tồn tại vì bản đầu của #43 **không có** đường bật nào: cờ được
 * `runRound` đọc nhưng không endpoint, không UI, không seed script nào ghi được nó ⇒ phép xáo
 * thứ tự thẻ chưa bao giờ chạy. Không test nào phát hiện, vì mock Prisma thì cờ nào cũng "đọc được".
 */
describe('DebiasController', () => {
  const prisma = {
    project: {
      findUniqueOrThrow: jest.fn<Promise<unknown>, [unknown]>(),
      update: jest.fn<
        Promise<unknown>,
        [{ data: { judge_debias: boolean } }]
      >(),
    },
  };
  const project = { assertOwned: jest.fn() };
  const c = new DebiasController(prisma as never, project as never);

  beforeEach(() => jest.clearAllMocks());

  it('đọc trả về trạng thái cờ', async () => {
    prisma.project.findUniqueOrThrow.mockResolvedValue({ judge_debias: true });
    await expect(c.read('p-1', 'u-1')).resolves.toEqual({ enabled: true });
  });

  it('BẬT được cờ — đây là thứ #43 thiếu', async () => {
    prisma.project.update.mockResolvedValue({ judge_debias: true });
    const res = await c.set('p-1', { enabled: true }, 'u-1');

    expect(prisma.project.update.mock.calls[0][0].data).toEqual({
      judge_debias: true,
    });
    expect(res).toEqual({ enabled: true });
  });

  it('TẮT được cờ — không phải endpoint một chiều', async () => {
    prisma.project.update.mockResolvedValue({ judge_debias: false });
    await c.set('p-1', { enabled: false }, 'u-1');
    expect(prisma.project.update.mock.calls[0][0].data).toEqual({
      judge_debias: false,
    });
  });

  it('KIỂM QUYỀN trước khi ghi — dự án của người khác không sửa được', async () => {
    project.assertOwned.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(c.set('p-1', { enabled: true }, 'u-2')).rejects.toThrow();
    // Chốt quan trọng: không được ghi gì sau khi kiểm quyền thất bại.
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('kiểm quyền cả ở đường ĐỌC', async () => {
    project.assertOwned.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(c.read('p-1', 'u-2')).rejects.toThrow();
    expect(prisma.project.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
