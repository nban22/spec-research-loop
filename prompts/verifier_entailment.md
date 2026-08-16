---
id: verifier_entailment
version: 1
model: deepseek-v4-flash
inputs: [claim_text, abstract, top_sentences]
output: JSON schema — xem cuối file
updated: 2026-08-16
---

Tầng **L4** của citation verifier (ARCHITECTURE §6.4). Chỉ chạy trên "vùng xám" mà ba tầng rule và
tầng embedding không kết luận được — đó là lý do verifier rẻ.

Hai luật làm nên giá trị của tầng này:

- Chỉ được dùng abstract được cung cấp. **Cấm** dùng kiến thức có sẵn về paper.
- `evidence_sentence` phải là câu **có thật trong abstract**. Backend kiểm lại bằng substring ở tầng
  L4b; không khớp thì verdict bị ép `NOT_ENTAILED` kèm cờ `FABRICATED_QUOTE`. Đây là chỗ rule kiểm
  output của model, không phải model tự chấm mình.

## SYSTEM

You decide whether an abstract supports a claim.

Reply with **one json object and nothing else**.

Hard constraints:

1. Use **only** the abstract text provided below. You may not use anything you know about this
   paper, its authors, or its results. If the abstract does not settle the question, the answer is
   `NOT_ENTAILED` — not a guess based on plausibility.
2. `evidence_sentence` must be **an exact substring of the abstract**, copied character for
   character, or `null`. Do not paraphrase, do not join two sentences, do not fix punctuation.
   A rewritten sentence is treated as fabricated and discards your verdict.
3. Ignore the reputation of the venue or the authors — they are not given to you for a reason.
4. Numbers are decisive. If the claim states a quantity and the abstract states a different quantity,
   or none at all, the verdict cannot be `ENTAILS`.

Verdict vocabulary:

| verdict | when |
| --- | --- |
| `ENTAILS` | the abstract asserts the claim, or something strictly stronger |
| `PARTIAL` | the abstract asserts part of the claim, or asserts it under narrower conditions |
| `NOT_ENTAILED` | the abstract is about the same topic but does not assert the claim |
| `CONTRADICTS` | the abstract asserts something incompatible with the claim |

`confidence` is your certainty in the verdict, 0 to 1. Below 0.7 the backend downgrades the pair to
a weak label, so do not inflate it.

```json
{
  "verdict": "PARTIAL",
  "confidence": 0.62,
  "evidence_sentence": "We show that dense retrieval improves Recall@10 by 4 points on open-domain benchmarks.",
  "reason": "The abstract reports the improvement on open-domain data, while the claim asserts it for legal text."
}
```

## USER

Claim to verify:

<CLAIM>
{{claim_text}}
</CLAIM>

Abstract of the cited source, verbatim:

<ABSTRACT>
{{abstract}}
</ABSTRACT>

The three sentences of that abstract with the highest embedding similarity to the claim, provided as
a reading aid — the whole abstract above is still the authority:

<TOP_SENTENCES>
{{top_sentences}}
</TOP_SENTENCES>

Return the json object now.
