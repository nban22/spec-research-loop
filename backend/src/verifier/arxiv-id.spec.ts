import { ArxivDetectInput, detectArxivId, fullTextUrls } from './arxiv-id';

function src(over: Partial<ArxivDetectInput> = {}): ArxivDetectInput {
  return {
    retrieved_from: 'SEMANTIC_SCHOLAR',
    external_id: 'abc123',
    doi: null,
    url: null,
    raw: {},
    ...over,
  };
}

describe('nhận diện bài arXiv', () => {
  it('lấy id từ DOI 10.48550 và bỏ phần version', () => {
    expect(detectArxivId(src({ doi: '10.48550/arxiv.2301.12345v3' }))).toEqual({
      id: '2301.12345',
      version: 3,
      from: 'DOI',
    });
  });

  it('lấy id từ URL abs và từ URL pdf', () => {
    expect(
      detectArxivId(src({ url: 'https://arxiv.org/abs/2401.09876' }))?.id,
    ).toBe('2401.09876');
    expect(
      detectArxivId(src({ url: 'http://arxiv.org/pdf/2401.09876v2.pdf' })),
    ).toEqual({ id: '2401.09876', version: 2, from: 'URL' });
  });

  it('lấy id từ externalIds của Semantic Scholar — đường trúng nhiều nhất', () => {
    const got = detectArxivId(
      src({ raw: { externalIds: { ArXiv: '2306.00001', DOI: '10.1/x' } } }),
    );
    expect(got).toEqual({ id: '2306.00001', version: null, from: 'RAW_S2' });
  });

  it('lấy id từ locations của OpenAlex', () => {
    const got = detectArxivId(
      src({
        retrieved_from: 'OPENALEX',
        raw: {
          ids: { doi: 'https://doi.org/10.1145/other' },
          primary_location: { landing_page_url: 'https://example.com/paper' },
          locations: [{ pdf_url: 'https://arxiv.org/pdf/1907.11692.pdf' }],
        },
      }),
    );
    expect(got).toEqual({
      id: '1907.11692',
      version: null,
      from: 'RAW_OPENALEX',
    });
  });

  it('nhận id dạng cũ trước 2007', () => {
    expect(
      detectArxivId(src({ url: 'https://arxiv.org/abs/cs.CL/0112017' }))?.id,
    ).toBe('cs.CL/0112017');
  });

  it('trả null cho nguồn không phải arXiv — đây là ca thường gặp nhất', () => {
    expect(
      detectArxivId(
        src({
          doi: '10.1145/3292500.3330701',
          url: 'https://dl.acm.org/doi/10.1145/3292500.3330701',
          raw: { externalIds: { DOI: '10.1145/3292500.3330701' } },
        }),
      ),
    ).toBeNull();
  });

  it('từ chối chuỗi không đúng dạng id thay vì đoán bừa', () => {
    // Không có bước kiểm dạng thì URL này thành "id" rồi tầng fetch đi tải 404.
    expect(
      detectArxivId(src({ url: 'https://arxiv.org/abs/list' })),
    ).toBeNull();
  });

  it('ưu tiên DOI hơn raw khi cả hai cùng có', () => {
    const got = detectArxivId(
      src({
        doi: '10.48550/arxiv.2301.11111',
        raw: { externalIds: { ArXiv: '2302.22222' } },
      }),
    );
    expect(got?.from).toBe('DOI');
  });
});

describe('chuỗi URL toàn văn', () => {
  it('thử bản có version, rồi bản trần, rồi v1, cuối cùng mới tới ar5iv', () => {
    const urls = fullTextUrls({ id: '2301.12345', version: 2, from: 'DOI' });
    expect(urls.map((u) => u.url)).toEqual([
      'https://arxiv.org/html/2301.12345v2',
      'https://arxiv.org/html/2301.12345',
      'https://arxiv.org/html/2301.12345v1',
      'https://ar5iv.labs.arxiv.org/html/2301.12345',
    ]);
    expect(urls[urls.length - 1].provider).toBe('AR5IV');
  });

  it('không có version thì bỏ luôn URL kèm version', () => {
    const urls = fullTextUrls({ id: '2301.12345', version: null, from: 'URL' });
    expect(urls).toHaveLength(3);
  });
});
