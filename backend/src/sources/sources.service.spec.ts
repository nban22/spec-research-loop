import { SourcesService } from './sources.service';

describe('SourcesService', () => {
  const prisma = {
    source: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  const client = { search: jest.fn(), fetchAbstractByDoi: jest.fn() };
  // #1 — chấm điểm tin cậy chạy ở cuối `searchAndStore`. Mock nó ở đây để test này vẫn đo đúng
  // thứ nó định đo (tìm và khử trùng nguồn), không kéo theo cả tầng chấm điểm.
  const credibility = { rescoreProject: jest.fn().mockResolvedValue(0) };
  const service = new SourcesService(
    prisma as never,
    client as never,
    credibility as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects empty query list', async () => {
    await expect(
      service.searchAndStore('p-1', ['  ', 'a']),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('throws SOURCE_PROVIDER_UNAVAILABLE when client returns zero sources', async () => {
    client.search.mockResolvedValue({
      sources: [],
      providersUsed: [],
      providerErrors: ['S2 429'],
    });

    await expect(
      service.searchAndStore('p-1', ['deep learning']),
    ).rejects.toMatchObject({
      code: 'SOURCE_PROVIDER_UNAVAILABLE',
    });
  });

  it('stores non-duplicate sources and skips existing DOIs', async () => {
    client.search.mockResolvedValue({
      sources: [
        {
          title: 'Existing Paper',
          doi: '10.1000/182',
          retrieved_from: 'SEMANTIC_SCHOLAR',
          external_id: 's2-1',
          authors: ['Author A'],
          year: 2024,
          venue: 'Venue A',
          url: 'http://a.com',
          abstract: 'Abs',
          citation_count: 10,
          raw: {},
        },
        {
          title: 'New Unique Paper',
          doi: '10.1000/999',
          retrieved_from: 'OPENALEX',
          external_id: 'oa-1',
          authors: ['Author B'],
          year: 2024,
          venue: 'Venue B',
          url: 'http://b.com',
          abstract: 'Abs B',
          citation_count: 5,
          raw: {},
        },
      ],
      providersUsed: ['SEMANTIC_SCHOLAR', 'OPENALEX'],
      providerErrors: [],
    });

    prisma.source.findMany.mockResolvedValue([
      { id: 's-1', title: 'Existing Paper', doi: '10.1000/182', year: 2024 },
    ]);
    prisma.source.create.mockResolvedValue({ id: 's-2' });

    const result = await service.searchAndStore('p-1', ['deep learning']);
    expect(result.stored).toBe(1);
    expect(result.skippedDuplicates).toBe(1);
    expect(prisma.source.upsert).toHaveBeenCalledTimes(1);
  });

  it('lists stored sources for a project', async () => {
    prisma.source.findMany.mockResolvedValue([
      {
        id: 's-1',
        title: 'Paper Title',
        authors: ['Author 1'],
        year: 2024,
        venue: 'NeurIPS',
        doi: '10.1/1',
        url: null,
        abstract: 'Abs',
        citation_count: 10,
        retrieved_from: 'SEMANTIC_SCHOLAR',
        doi_verified: true,
      },
    ]);

    const result = await service.list('p-1');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Paper Title');
  });

  it('sourcesForPrompt returns mapped lightweight sources', async () => {
    prisma.source.findMany.mockResolvedValue([
      {
        id: 's-1',
        title: 'Paper Title',
        year: 2024,
        venue: 'NeurIPS',
        doi: '10.1/1',
        url: null,
        retrieved_from: 'SEMANTIC_SCHOLAR',
        external_id: 'ext-1',
        abstract: 'Abstract text',
      },
    ]);

    const result = await service.sourcesForPrompt('p-1');
    expect(result).toHaveLength(1);
    expect(result[0].source_id).toBe('s-1');
  });

  it('remove throws NOT_FOUND for unknown sourceId', async () => {
    prisma.source.findFirst.mockResolvedValue(null);
    await expect(service.remove('p-1', 's-missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove deletes found source', async () => {
    prisma.source.findFirst.mockResolvedValue({ id: 's-1' });
    prisma.source.delete.mockResolvedValue({ id: 's-1' });

    await service.remove('p-1', 's-1');
    expect(prisma.source.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
  });
});
