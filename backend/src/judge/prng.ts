/**
 * Nguồn ngẫu nhiên **có seed** dùng chung trong `src/judge/**`.
 *
 * Tách ra khỏi `agreement/agreement.ts` (nơi nó ra đời cho #9) khi #43 cũng cần xáo thứ tự thẻ.
 * Viết bản cài thứ hai là đúng loại lỗi mà review của #32 đã bắt: hai chỗ cài cùng một thứ rồi
 * lệch nhau mà không có gì phát hiện — `bucketOf` từng thành code chết đúng vì vậy.
 *
 * **Cấm `Math.random()` trong làn B.** Hai lý do khác nhau, cùng một kết luận:
 * - #9: NFR-JDG-6 đòi số đo cố định. p-value tính bằng mô phỏng mà nguồn ngẫu nhiên tự do thì
 *   F5 hai lần ra hai con số.
 * - #43: thứ tự thẻ mà từng judge đã thấy phải **dựng lại được**, không thì `shuffle_seed` không
 *   còn là bằng chứng mà chỉ là một con số trong DB.
 */

/**
 * mulberry32 — PRNG 32-bit, một trạng thái, không phụ thuộc nền tảng.
 *
 * Chọn nó vì kết quả **giống nhau trên mọi máy và mọi phiên bản Node**: chỉ dùng `Math.imul` và
 * dịch bit trên số nguyên 32-bit, không dùng số thực ở phần trạng thái. `Math.random` của V8
 * không có bảo đảm đó, và cũng không nhận seed.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a — biến một khoá chuỗi thành seed 32-bit.
 *
 * Chỉ cần **ổn định** và **tản đều**; không cần chống đối kháng, vì không ai được lợi từ việc đoán
 * trước thứ tự thẻ của một judge. Nếu về sau cần chống đối kháng thì đổi sang sha256 rồi lấy 4 byte
 * đầu — nhưng khi đó phải đổi cả `agreement`, và số p đã lưu sẽ không dựng lại được.
 */
export function seedFrom(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Fisher–Yates trên **bản sao**, không sửa mảng của lời gọi.
 *
 * `arr.slice()` là có chủ ý: `permutationNull` gọi hàm này 1000 lần trong vòng lặp, và sửa tại chỗ
 * một lần là dữ liệu gốc bị hỏng cho 999 lần sau.
 */
export function shuffle<T>(arr: readonly T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
