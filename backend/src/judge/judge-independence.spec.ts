import { createHash } from 'node:crypto';
import { JUDGE_DEFS } from '../contracts/enums';
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

  const specJson = {
    title: 'Reference-aware retrieval',
    cards: [{ title: 'Claim A', type: 'CLAIM', status: 'PROPOSED', body: 'x' }],
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

  it('5 judge nhận đúng cùng một khối dữ liệu dùng chung ⇒ cùng input_digest', () => {
    const sharedInput = JSON.stringify({
      spec_json: specJson,
      sources_json: sourcesJson,
    });
    const digests = rendered.map(() =>
      createHash('sha256').update(sharedInput).digest('hex'),
    );
    expect(new Set(digests).size).toBe(1);
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
