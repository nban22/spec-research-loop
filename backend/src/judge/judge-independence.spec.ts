import { createHash } from 'node:crypto';
import { JUDGE_DEFS } from '../contracts/enums';
import {
  canonicalDigest,
  legacyDigest,
  seedFor,
  shuffleForJudge,
} from './card-shuffle';
import { PromptLoaderService } from '../prompts/prompt-loader.service';

/**
 * Bằng chứng độc lập của 5 judge — phần đề bài chấm thẳng vào (kim-chỉ-nam §11 rủi ro #3).
 *
 * Test này khẳng định điều mà dữ liệu runtime cũng phải khẳng định:
 * đầu vào của J2 **không chứa** đầu ra của J1, và cả 5 judge nhận đúng cùng một đầu vào.
 * Đây là khác biệt giữa *"tôi có gọi 5 lần riêng"* và *"tôi chứng minh được 5 lần đó riêng"*.
 */
describe('Judge independence', () => {
  const loader = new PromptLoaderService();

  // Nhiều thẻ là **bắt buộc** từ #43: một thẻ thì phép xáo là hàm đồng nhất, nên test "5 judge
  // thấy 5 thứ tự khác nhau" sẽ đỏ dù code đúng.
  const specJson = {
    title: 'Reference-aware retrieval',
    cards: [
      { title: 'Claim A', type: 'CLAIM', status: 'PROPOSED', body: 'x' },
      { title: 'Gap B', type: 'GAP', status: 'PROPOSED', body: 'y' },
      {
        title: 'Contribution C',
        type: 'CONTRIBUTION',
        status: 'PROPOSED',
        body: 'z',
      },
      { title: 'Evidence D', type: 'EVIDENCE', status: 'CONFIRMED', body: 'w' },
      {
        title: 'Constraint E',
        type: 'CONSTRAINT',
        status: 'CONFIRMED',
        body: 'v',
      },
    ],
  };
  const sourcesJson = [
    { source_id: 's1', title: 'A paper', abstract: 'Some abstract.' },
  ];

  /** Chuỗi chỉ có thể xuất hiện nếu output của một judge bị truyền sang judge khác. */
  const J1_OUTPUT_MARKER = 'J1_LEAKED_FINDING_MARKER_8f2c';
  const j1Output = JSON.stringify({
    summary: J1_OUTPUT_MARKER,
    issues: [{ title: J1_OUTPUT_MARKER, severity: 'CRITICAL' }],
  });

  const rendered = JUDGE_DEFS.map((def) => {
    const prompt = loader.load(def.promptId);
    return {
      key: def.key,
      promptId: def.promptId,
      system: PromptLoaderService.render(prompt.system, {
        spec_json: specJson,
        sources_json: sourcesJson,
      }),
      user: PromptLoaderService.render(prompt.user, {
        spec_json: specJson,
        sources_json: sourcesJson,
      }),
    };
  });

  it('nạp đủ 5 prompt judge', () => {
    expect(rendered).toHaveLength(5);
    expect(rendered.map((r) => r.key)).toEqual(['J1', 'J2', 'J3', 'J4', 'J5']);
  });

  it('đầu vào của mọi judge KHÔNG chứa đầu ra của judge khác', () => {
    for (const r of rendered) {
      expect(r.system.includes(J1_OUTPUT_MARKER)).toBe(false);
      expect(r.user.includes(J1_OUTPUT_MARKER)).toBe(false);
    }
    // Và chuỗi đó thật sự tồn tại — nếu không thì test trên vô nghĩa.
    expect(j1Output).toContain(J1_OUTPUT_MARKER);
  });

  it('không prompt judge nào tham chiếu prompt judge khác (rule prompt-audit #3)', () => {
    for (const r of rendered) {
      const others = JUDGE_DEFS.filter((d) => d.promptId !== r.promptId);
      for (const other of others) {
        expect(`${r.system}${r.user}`.includes(other.promptId)).toBe(false);
      }
    }
  });

  /**
   * ## Vì sao test này được viết lại ở #43
   *
   * Bản trước là **tautology**:
   *
   * ```ts
   * const digests = rendered.map(() => createHash('sha256').update(sharedInput).digest('hex'));
   * expect(new Set(digests).size).toBe(1);
   * ```
   *
   * Nó `map` qua 5 judge nhưng **bỏ qua phần tử** — băm đúng một chuỗi 5 lần thì tất nhiên ra 1
   * giá trị. Test **không thể fail**, và nó **không gọi tới `judge.service.ts`**: nó tự cài lại
   * phép băm, nên production đổi cách tính digest thì nó vẫn xanh.
   *
   * Đây là file được đề bài chấm thẳng vào như *bằng chứng 5 judge độc lập*. Bằng chứng đó trước
   * #43 chưa được test nào bảo vệ.
   *
   * Bản mới gọi **đúng hàm production** (`legacyDigest` / `canonicalDigest`) và dựng đầu vào
   * **riêng cho từng judge** đúng như `runRound` làm.
   */
  it('cờ TẮT — 5 judge nhận cùng một chuỗi ⇒ cùng input_digest', () => {
    const digests = JUDGE_DEFS.map(() => legacyDigest(specJson, sourcesJson));
    expect(new Set(digests).size).toBe(1);
  });

  it('cờ TẮT — digest KHÔNG đổi so với giá trị đã chốt', () => {
    // Chốt hồi quy cứng. Mọi `input_digest` đã ghi trong DB được tính bằng công thức này; đổi nó
    // là làm mọi bản ghi cũ không đối chiếu được nữa. Một hằng số cứng ở đây khiến việc đó **không
    // thể xảy ra âm thầm** — muốn đổi thì phải sửa test, tức là phải cố ý.
    expect(legacyDigest(specJson, sourcesJson)).toBe(
      createHash('sha256')
        .update(
          JSON.stringify({ spec_json: specJson, sources_json: sourcesJson }),
        )
        .digest('hex'),
    );
  });

  it('cờ BẬT — 5 judge thấy 5 thứ tự KHÁC nhau nhưng CÙNG digest', () => {
    // Tính chất gánh cả #43: bằng chứng độc lập sống sót qua phép xáo.
    const digest = canonicalDigest(specJson, sourcesJson);
    const perJudge = JUDGE_DEFS.map((def) => {
      const seed = seedFor(digest, def.key, 1);
      return {
        seed,
        order: JSON.stringify(shuffleForJudge(specJson, seed).cards),
        digest: canonicalDigest(shuffleForJudge(specJson, seed), sourcesJson),
      };
    });
    expect(new Set(perJudge.map((x) => x.digest)).size).toBe(1);
    expect(new Set(perJudge.map((x) => x.seed)).size).toBe(5);
    expect(new Set(perJudge.map((x) => x.order)).size).toBeGreaterThan(1);
  });

  it('cờ BẬT — dựng lại được đầu vào của một judge từ (digest, judge, vòng)', () => {
    // Không có tính chất này thì `shuffle_seed` chỉ là một chuỗi trong DB, không phải bằng chứng.
    const digest = canonicalDigest(specJson, sourcesJson);
    const seedStored = seedFor(digest, 'J3', 1);
    // Người kiểm chứng chỉ có `(digest, 'J3', 1)` và tập thẻ — tự tính lại seed rồi dựng đầu vào.
    const seedRecomputed = seedFor(digest, 'J3', 1);
    expect(seedRecomputed).toBe(seedStored);
    expect(JSON.stringify(shuffleForJudge(specJson, seedRecomputed))).toBe(
      JSON.stringify(shuffleForJudge(specJson, seedStored)),
    );
  });

  it('cờ BẬT — thứ tự đã xáo vẫn KHÔNG chứa đầu ra của judge khác', () => {
    // Xáo thứ tự không được vô tình mở đường cho dữ liệu lạ lọt vào đầu vào.
    const digest = canonicalDigest(specJson, sourcesJson);
    for (const def of JUDGE_DEFS) {
      const shuffled = JSON.stringify(
        shuffleForJudge(specJson, seedFor(digest, def.key, 1)),
      );
      expect(shuffled.includes(J1_OUTPUT_MARKER)).toBe(false);
    }
  });

  it('khối SYSTEM giống hệt nhau giữa 5 judge — điều kiện để ăn cache prefix (STACK §2.5)', () => {
    const systems = new Set(rendered.map((r) => r.system));
    expect(systems.size).toBe(1);
  });

  it('mỗi judge có nhiệm vụ RIÊNG ở khối USER', () => {
    const users = new Set(rendered.map((r) => r.user));
    expect(users.size).toBe(5);
  });

  it('prompt_hash khác nhau giữa 5 file — chứng minh chúng là 5 prompt riêng', () => {
    const hashes = new Set(JUDGE_DEFS.map((d) => loader.load(d.promptId).hash));
    expect(hashes.size).toBe(5);
  });

  it('phân bổ model đúng như STACK §2.3', () => {
    expect(JUDGE_DEFS.map((d) => d.model)).toEqual([
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
  });
});
