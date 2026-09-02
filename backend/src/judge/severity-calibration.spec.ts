import {
  MIN_ROUNDS_FOR_CALIBRATION,
  RANK,
  SD_FLOOR,
  calibratedRank,
  calibratedSeverity,
  groupScale,
  judgeStats,
  type Observation,
} from './severity-calibration';

/**
 * #44 — chuẩn hoá thang mức độ. Tính chất gánh cả issue: **judge nặng tay đều đặn thì sau chuẩn
 * hoá mức của nó không còn áp đảo nhóm**; và khi lịch sử chưa đủ thì **không hiệu chỉnh gì**.
 */

/** Sinh lịch sử: `judge` nêu `perRound` issue mỗi vòng, trong `rounds` vòng, theo mẫu `pattern`. */
function history(
  judge: string,
  rounds: number,
  pattern: string[],
): Observation[] {
  const out: Observation[] = [];
  for (let r = 1; r <= rounds; r++) {
    for (const severity of pattern) {
      out.push({ judgeKey: judge, severity, roundKey: `v-1:${r}` });
    }
  }
  return out;
}

describe('judgeStats', () => {
  it('đếm VÒNG riêng biệt, không đếm số issue', () => {
    // Một judge nêu 20 issue trong MỘT vòng vẫn chỉ là một lần chấm.
    const many = Array.from({ length: 20 }, () => ({
      judgeKey: 'J1',
      severity: 'MAJOR',
      roundKey: 'v-1:1',
    }));
    const [s] = judgeStats(many);
    expect(s.n).toBe(20);
    expect(s.rounds).toBe(1);
    expect(s.reason).toBe('NOT_ENOUGH_ROUNDS');
  });

  it('dưới ngưỡng vòng ⇒ KHÔNG dùng được, kèm lý do', () => {
    const s = judgeStats(
      history('J1', MIN_ROUNDS_FOR_CALIBRATION - 1, ['MINOR', 'CRITICAL']),
    );
    expect(s[0].usable).toBe(false);
    expect(s[0].reason).toBe('NOT_ENOUGH_ROUNDS');
  });

  it('đủ vòng và có phương sai ⇒ dùng được', () => {
    const s = judgeStats(
      history('J1', MIN_ROUNDS_FOR_CALIBRATION, ['MINOR', 'CRITICAL']),
    );
    expect(s[0].usable).toBe(true);
    expect(s[0].reason).toBe('OK');
    expect(s[0].mean).toBeCloseTo(2, 10);
  });

  it('judge LUÔN chấm một mức ⇒ NO_VARIANCE, không chia cho ~0', () => {
    const s = judgeStats(history('J4', 10, ['CRITICAL']));
    expect(s[0].sd).toBe(0);
    expect(s[0].usable).toBe(false);
    expect(s[0].reason).toBe('NO_VARIANCE');
  });

  it('mức LẠ bị bỏ qua, KHÔNG tính là 0', () => {
    // 0 không phải một mức. Tính nó là 0 thì trung bình bị kéo xuống và mọi hiệu chỉnh lệch theo.
    const obs: Observation[] = [
      ...history('J1', 6, ['MAJOR']),
      { judgeKey: 'J1', severity: 'CHUYỆN_GÌ_ĐÂY', roundKey: 'v-1:7' },
    ];
    const [s] = judgeStats(obs);
    expect(s.n).toBe(6);
    expect(s.mean).toBeCloseTo(2, 10);
  });

  it('lịch sử rỗng ⇒ mảng rỗng, không nổ', () => {
    expect(judgeStats([])).toEqual([]);
  });
});

describe('calibratedSeverity — các chốt', () => {
  const scale = { mean: 2, sd: 0.8 };

  it('không có thống kê ⇒ giữ mức gốc', () => {
    const r = calibratedSeverity('CRITICAL', undefined, scale);
    expect(r).toEqual({
      severity: 'CRITICAL',
      changed: false,
      reason: 'NO_HISTORY',
    });
  });

  it('thống kê chưa dùng được ⇒ giữ mức gốc, TRẢ ĐÚNG LÝ DO', () => {
    const [s] = judgeStats(history('J1', 2, ['MINOR', 'CRITICAL']));
    const r = calibratedSeverity('CRITICAL', s, scale);
    expect(r.severity).toBe('CRITICAL');
    expect(r.reason).toBe('NOT_ENOUGH_ROUNDS');
  });

  it('thang CHUNG suy biến ⇒ giữ mức gốc', () => {
    const [s] = judgeStats(history('J1', 6, ['MINOR', 'CRITICAL']));
    const r = calibratedSeverity('CRITICAL', s, {
      mean: 2,
      sd: SD_FLOOR - 0.01,
    });
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('NO_VARIANCE');
  });

  it('mức lạ ⇒ đi qua nguyên vẹn', () => {
    const [s] = judgeStats(history('J1', 6, ['MINOR', 'CRITICAL']));
    expect(calibratedSeverity('KHÔNG_TỒN_TẠI', s, scale).severity).toBe(
      'KHÔNG_TỒN_TẠI',
    );
  });

  it('KHÔNG bao giờ trả mức ngoài thang ba bậc', () => {
    // z lớn (judge phương sai rất nhỏ) đẩy kết quả ra ngoài [1,3] nếu không kẹp.
    const [s] = judgeStats(
      history('J1', 6, ['MAJOR', 'MAJOR', 'MAJOR', 'CRITICAL']),
    );
    for (const sev of ['MINOR', 'MAJOR', 'CRITICAL']) {
      const out = calibratedSeverity(sev, s, { mean: 2, sd: 5 }).severity;
      expect(['MINOR', 'MAJOR', 'CRITICAL']).toContain(out);
    }
  });
});

describe('calibratedSeverity — tính chất gánh cả #44', () => {
  it('judge NẶNG TAY: bậc đã hiệu chỉnh THẤP HƠN cùng mức của judge bình thường', () => {
    // Đây là hiệu ứng thật, và nó nhìn thấy được ở **bậc liên tục**, không ở tên mức.
    // J4 chỉ dùng MAJOR/CRITICAL (mean 2.5); ba judge kia dùng cả ba mức (mean 2).
    const all: Observation[] = [
      ...history('J4', 8, ['MAJOR', 'CRITICAL']),
      ...history('J1', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
      ...history('J2', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
      ...history('J3', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
    ];
    const stats = judgeStats(all);
    const scale = groupScale(stats);
    const j4 = stats.find((s) => s.judgeKey === 'J4')!;
    const j1 = stats.find((s) => s.judgeKey === 'J1')!;

    const harsh = calibratedRank('CRITICAL', j4, scale).rank;
    const normal = calibratedRank('CRITICAL', j1, scale).rank;
    expect(harsh).toBeCloseTo(2.625, 3);
    expect(normal).toBeCloseTo(3.125, 3);
    // `CRITICAL` của judge nặng tay xếp DƯỚI `CRITICAL` của judge bình thường ⇒ không còn tự động
    // quyết mức của nhóm.
    expect(harsh).toBeLessThan(normal);
  });

  it('⚠️ tên mức thường KHÔNG đổi — vách làm tròn 0,5 bậc', () => {
    // Ghim giới hạn đã biết, thay vì để nó thành điều bất ngờ khi đọc báo cáo: lệch 0,375 bậc thì
    // `2.625` làm tròn về `3` và tên mức y nguyên. Đó chính là lý do việc gộp nhóm dùng
    // `calibratedRank` (liên tục) chứ không dùng `calibratedSeverity`.
    const all: Observation[] = [
      ...history('J4', 8, ['MAJOR', 'CRITICAL']),
      ...history('J1', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
      ...history('J2', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
      ...history('J3', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
    ];
    const stats = judgeStats(all);
    const scale = groupScale(stats);
    const j4 = stats.find((s) => s.judgeKey === 'J4')!;
    expect(calibratedSeverity('CRITICAL', j4, scale).changed).toBe(false);
  });

  it('lệch ĐỦ LỚN (> 0,5 bậc) thì tên mức mới đổi', () => {
    // Chốt đối chứng cho test trên: cơ chế không phải luôn-không-đổi, nó cần độ lệch vượt vách.
    const all: Observation[] = [
      ...history('J4', 8, ['MAJOR', 'CRITICAL', 'CRITICAL', 'CRITICAL']),
      ...history('J1', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
      ...history('J2', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
      ...history('J3', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
    ];
    const stats = judgeStats(all);
    const scale = groupScale(stats);
    const j4 = stats.find((s) => s.judgeKey === 'J4')!;
    const out = calibratedSeverity('CRITICAL', j4, scale);
    expect(out.severity).toBe('MAJOR');
    expect(out.changed).toBe(true);
  });

  it('judge chấm ĐÚNG thang chung ⇒ mức KHÔNG đổi', () => {
    // Chốt đối chứng: nếu hiệu chỉnh đổi mức của mọi judge thì nó không đo gì, chỉ nhiễu thêm.
    const all: Observation[] = ['J1', 'J2', 'J3'].flatMap((j) =>
      history(j, 8, ['MINOR', 'MAJOR', 'CRITICAL']),
    );
    const stats = judgeStats(all);
    const scale = groupScale(stats);
    for (const st of stats) {
      for (const sev of ['MINOR', 'MAJOR', 'CRITICAL']) {
        expect(calibratedSeverity(sev, st, scale).severity).toBe(sev);
        // Ba judge giống nhau ⇒ bậc hiệu chỉnh = bậc thô, không dịch đi đâu.
        expect(calibratedRank(sev, st, scale).rank).toBeCloseTo(RANK[sev], 10);
      }
    }
  });

  it('judge NHẸ TAY: bậc đã hiệu chỉnh CAO HƠN cùng mức của judge bình thường', () => {
    const all: Observation[] = [
      ...history('J2', 8, ['MINOR', 'MAJOR']),
      ...history('J1', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
      ...history('J3', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
    ];
    const stats = judgeStats(all);
    const scale = groupScale(stats);
    const j2 = stats.find((s) => s.judgeKey === 'J2')!;
    const j1 = stats.find((s) => s.judgeKey === 'J1')!;
    expect(j2.mean).toBeCloseTo(1.5, 10);
    // `MAJOR` của judge nhẹ tay nghĩa nhiều hơn `MAJOR` của judge bình thường.
    expect(calibratedRank('MAJOR', j2, scale).rank).toBeGreaterThan(
      calibratedRank('MAJOR', j1, scale).rank,
    );
  });

  it('groupScale chỉ tính judge DÙNG ĐƯỢC', () => {
    // Judge lịch sử mỏng không được kéo thang chung theo — nếu không thì một judge mới vào làm
    // lệch hiệu chỉnh của cả bốn người kia.
    const all: Observation[] = [
      ...history('J1', 8, ['MINOR', 'MAJOR', 'CRITICAL']),
      ...history('J5', 1, ['CRITICAL']),
    ];
    const stats = judgeStats(all);
    const scale = groupScale(stats);
    const j1 = stats.find((s) => s.judgeKey === 'J1')!;
    expect(scale.mean).toBeCloseTo(j1.mean, 10);
  });

  it('KHÔNG judge nào dùng được ⇒ thang chung rỗng, mọi mức đi qua nguyên vẹn', () => {
    const stats = judgeStats(history('J1', 1, ['CRITICAL']));
    const scale = groupScale(stats);
    expect(scale).toEqual({ mean: 0, sd: 0 });
    expect(calibratedSeverity('CRITICAL', stats[0], scale).changed).toBe(false);
    expect(calibratedRank('CRITICAL', stats[0], scale).rank).toBe(3);
  });
});
