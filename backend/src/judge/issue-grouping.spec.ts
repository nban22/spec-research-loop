import { groupIssues, type RawIssue, type RankOf } from './issue-grouping';

const issue = (over: Partial<RawIssue> & { id: string }): RawIssue => ({
  judgeKey: 'J1',
  title: 'Claim has no refutation condition',
  severity: 'MAJOR',
  targetCardId: 'card-1',
  ...over,
});

describe('groupIssues', () => {
  it('gộp hai judge mô tả cùng một vấn đề trên cùng một thẻ', () => {
    const groups = groupIssues([
      issue({ id: '1', judgeKey: 'J1' }),
      issue({
        id: '2',
        judgeKey: 'J2',
        title: 'The claim has no stated refutation condition',
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].judgeKeys.sort()).toEqual(['J1', 'J2']);
  });

  it('không gộp khi khác thẻ đích, dù tiêu đề giống hệt', () => {
    const groups = groupIssues([
      issue({ id: '1', targetCardId: 'card-1' }),
      issue({ id: '2', targetCardId: 'card-2' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('CRITICAL và MAJOR gộp được với nhau; MINOR thì không', () => {
    const blocking = groupIssues([
      issue({ id: '1', severity: 'CRITICAL', judgeKey: 'J1' }),
      issue({ id: '2', severity: 'MAJOR', judgeKey: 'J3' }),
    ]);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].maxSeverity).toBe('CRITICAL');

    const mixed = groupIssues([
      issue({ id: '1', severity: 'CRITICAL', judgeKey: 'J1' }),
      issue({ id: '2', severity: 'MINOR', judgeKey: 'J3' }),
    ]);
    expect(mixed).toHaveLength(2);
  });

  it('cùng một judge nêu hai lần vẫn chỉ tính là một phiếu đồng thuận', () => {
    const groups = groupIssues([
      issue({ id: '1', judgeKey: 'J1' }),
      issue({
        id: '2',
        judgeKey: 'J1',
        title: 'Claim lacks a refutation condition',
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].judgeKeys).toEqual(['J1']);
    expect(groups[0].issueIds).toHaveLength(2);
  });

  it('DETERMINISTIC: chạy lại trên cùng đầu vào ra đúng kết quả cũ (NFR-JDG-6)', () => {
    const input = [
      issue({ id: '1', judgeKey: 'J1' }),
      issue({
        id: '2',
        judgeKey: 'J2',
        title: 'No refutation condition on the claim',
      }),
      issue({
        id: '3',
        judgeKey: 'J3',
        title: 'Experiment cannot distinguish the method from its baseline',
        targetCardId: null,
      }),
      issue({
        id: '4',
        judgeKey: 'J5',
        severity: 'MINOR',
        title: 'Section 9 is empty',
      }),
    ];
    const a = JSON.stringify(groupIssues(input));
    const b = JSON.stringify(groupIssues(input));
    expect(a).toBe(b);
  });

  it('sắp theo mức độ giảm dần, rồi theo số judge đồng thuận', () => {
    const groups = groupIssues([
      issue({
        id: '1',
        severity: 'MINOR',
        title: 'Minor wording',
        targetCardId: null,
      }),
      issue({
        id: '2',
        severity: 'CRITICAL',
        title: 'Fabricated number',
        targetCardId: 'c9',
      }),
    ]);
    expect(groups[0].maxSeverity).toBe('CRITICAL');
    expect(groups[1].maxSeverity).toBe('MINOR');
  });

  it('issue không gắn thẻ nào vẫn gộp được với nhau', () => {
    const groups = groupIssues([
      issue({
        id: '1',
        judgeKey: 'J1',
        targetCardId: null,
        title: 'Missing sections',
      }),
      issue({
        id: '2',
        judgeKey: 'J5',
        targetCardId: null,
        title: 'Missing spec sections',
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].judgeKeys.sort()).toEqual(['J1', 'J5']);
  });
});

/* ------------------------------------------------- #44 · bậc hiệu chỉnh khi gộp nhóm */

describe('groupIssues với rankOf đã hiệu chỉnh (#44)', () => {
  /** J4 nặng tay: `CRITICAL` của nó chỉ đáng 2.625. J1 bình thường: `CRITICAL` đáng 3.125. */
  const calibrated: RankOf = (i) => {
    const raw = { CRITICAL: 3, MAJOR: 2, MINOR: 1 }[i.severity];
    return i.judgeKey === 'J4' ? raw - 0.375 : raw + 0.125;
  };

  const issue = (
    id: string,
    judgeKey: string,
    severity: 'CRITICAL' | 'MAJOR' | 'MINOR',
    title: string,
  ) => ({ id, judgeKey, severity, title, targetCardId: 'c1' }) as const;

  it('judge nặng tay KHÔNG còn tự động làm chủ nhóm', () => {
    // Hai judge cùng nêu `CRITICAL` trên cùng một thẻ, tiêu đề giống nhau ⇒ một nhóm.
    // Không hiệu chỉnh: J4 vào trước nên giữ ngôi. Có hiệu chỉnh: J1 vượt lên.
    const issues = [
      issue('i1', 'J4', 'CRITICAL', 'Missing baseline comparison'),
      issue('i2', 'J1', 'CRITICAL', 'Missing baseline comparison'),
    ];

    const raw = groupIssues(issues);
    expect(raw).toHaveLength(1);
    expect(raw[0].canonicalTitle).toBe('Missing baseline comparison');

    const cal = groupIssues(issues, calibrated);
    expect(cal).toHaveLength(1);
    // Mức thô của người thắng — KHÔNG bịa ra mức nào.
    expect(cal[0].maxSeverity).toBe('CRITICAL');
    expect(cal[0].judgeKeys).toEqual(['J4', 'J1']);
    // Bậc của người thắng là bậc ĐÃ hiệu chỉnh của J1, không phải bậc thô 3.
    expect(cal[0].winnerRank).toBeCloseTo(3.125, 3);
  });

  it('mức của nhóm luôn là mức THÔ, không bao giờ là số đã hiệu chỉnh', () => {
    // Chốt chặn: hiệu chỉnh chỉ quyết định *ai thắng*, không được rò vào `max_severity`.
    const cal = groupIssues(
      [issue('i1', 'J4', 'MAJOR', 'Chunking strategy undefined')],
      calibrated,
    );
    expect(cal[0].maxSeverity).toBe('MAJOR');
    expect(['CRITICAL', 'MAJOR', 'MINOR']).toContain(cal[0].maxSeverity);
  });

  it('KHÔNG truyền rankOf ⇒ hành vi giống hệt trước #44', () => {
    // Cờ `judge_debias` tắt là đường này. Phải giống từng byte.
    const issues = [
      issue('i1', 'J4', 'MAJOR', 'Missing baseline comparison'),
      issue('i2', 'J1', 'CRITICAL', 'Missing baseline comparison'),
      issue('i3', 'J2', 'MINOR', 'Something else entirely different here'),
    ];
    const a = groupIssues(issues);
    const b = groupIssues(issues);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Nhóm blocking lấy CRITICAL của J1; MINOR tách nhóm riêng theo `bucket`.
    expect(a.map((g) => g.maxSeverity)).toEqual(['CRITICAL', 'MINOR']);
  });
});
