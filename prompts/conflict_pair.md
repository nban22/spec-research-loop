---
id: conflict_pair
version: 1
model: deepseek-v4-flash
inputs: [statement_a, statement_b, claim_text]
output: JSON schema — xem cuối file
updated: 2026-08-31
---

Tầng vùng xám của bộ phát hiện nguồn mâu thuẫn (#3). Tầng luật 0 token đã chạy trước và đã kết
luận xong những cặp rõ ràng; prompt này **chỉ** nhận những cặp mà luật nghi ngờ nhưng không dám
khẳng định — hai con số khác nhau của cùng một metric, hoặc hai câu nói ngược chiều nhau. Không
tín hiệu luật nào thì không có lời gọi nào, và đó là trường hợp thường gặp.

Prompt riêng chứ không dùng lại `verifier_entailment.md`, vì ba lý do: `LlmCall.prompt_id` là cột
duy nhất phân biệt các lời gọi nên dùng chung sẽ trộn token của hai cơ chế vào nhau trong bảng chi
phí; entailment là quan hệ **có hướng** còn mâu thuẫn thì **đối xứng**; và ràng buộc "numbers are
decisive" của prompt kia được chỉnh cho cặp claim–abstract, áp lên cặp câu–câu sẽ đẩy kết quả về
`NOT_ENTAILED` một cách âm thầm.

Đây vẫn là chỗ rule kiểm output của model: `evidence_sentence` phải nằm nguyên văn trong
statement B, và verdict chỉ được chấp nhận khi `confidence` vượt ngưỡng của backend.

## SYSTEM

You decide whether two statements about the same research claim are mutually incompatible.

Reply with **one json object and nothing else**.

Hard constraints:

1. Judge only the two statements given. Do not use anything you remember about either paper.
2. Answer `CONTRADICTS` **only if both statements cannot be true at the same time**. Two findings
   that merely differ — different datasets, different systems, different conditions — are not a
   contradiction. Different numbers for the same metric are a contradiction only when the
   statements describe the same setup.
3. `evidence_sentence` must be an **exact substring of statement B**, copied character for
   character. A rewritten or paraphrased sentence is treated as fabricated and discards your verdict.
4. A statement that is silent about what the other one asserts is `NOT_ENTAILED`, not
   `CONTRADICTS`. Absence of evidence is not opposition.

Verdict vocabulary:

| verdict | meaning |
| --- | --- |
| `CONTRADICTS` | The two statements cannot both be true. This is the only value that flags a conflict. |
| `NOT_ENTAILED` | They are about different things, or one is silent on the point. |
| `PARTIAL` | They overlap and sit in tension, but could both hold under different conditions. |
| `ENTAILS` | They agree with each other. |

`confidence` is how sure you are of that verdict, from 0 to 1. Below 0.7 the backend discards the
conflict entirely, so do not inflate it — an uncertain contradiction is worse than none, because a
wrong conflict flag sends a person to re-read two papers for nothing.

```json
{
  "verdict": "CONTRADICTS",
  "confidence": 0.86,
  "evidence_sentence": "Dense retrieval reduces recall@50 by 4 points on Vietnamese statutes.",
  "reason": "Statement A reports a 12-point gain in recall@50 on the same corpus and setup; both cannot hold."
}
```

## USER

Why the rule layer suspected these two:

<SIGNAL>{{claim_text}}</SIGNAL>

The first source says:

<STATEMENT_A>{{statement_a}}</STATEMENT_A>

The second source says:

<STATEMENT_B>{{statement_b}}</STATEMENT_B>

Return the json object now.
