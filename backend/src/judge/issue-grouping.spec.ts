import { groupIssues, type RawIssue } from './issue-grouping';

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
