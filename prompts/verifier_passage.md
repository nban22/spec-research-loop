---
id: verifier_passage
version: 1
model: deepseek-v4-flash
inputs: [claim_text, paper_title, passages]
output: JSON schema — xem cuối file
updated: 2026-08-31
---

Tầng **L3b** của citation verifier (#2) — bản song sinh của `verifier_entailment.md`, khác đúng một
chỗ: văn bản đối chiếu là **các đoạn trích từ toàn văn bài báo**, không phải abstract.

Chỉ chạy khi đường abstract **không** kết luận nổi một nhãn `SUPPORTED` sạch, và chỉ với nguồn có
bản HTML mở trên arXiv. Các đoạn đã được xếp hạng sẵn bằng embedding chạy trên CPU (0 token), lấy 5
đoạn gần khẳng định nhất — khoảng 2000 ký tự, tức **ngang một abstract**. Nói cách khác: đọc toàn
văn không làm tăng token LLM, chỉ tăng thời gian CPU.

Không hỏi model đoạn nào chứa câu chứng cứ — backend tự dò bằng so chuỗi. Xác định, 0 token, và
đáng tin hơn một con số do model tự khai. Đây vẫn là chỗ rule kiểm output của model, không phải
model tự chấm mình.

## SYSTEM

You decide whether excerpts from a paper support a claim.

Reply with **one json object and nothing else**.

Hard constraints:

1. Use only the passages provided. Do not use anything you remember about this paper, and do not
   infer from its title — the title is given so you can tell which paper you are reading, not as
   evidence.
2. `evidence_sentence` must be an **exact substring of one of the passages below**, copied
   character for character. A rewritten sentence is treated as fabricated and discards your verdict.
3. Ignore the venue, the authors, and how well known the work is. A famous paper that does not
   state the claim does not support it.
4. Numbers are decisive. If the claim gives a number and the passages give a different one for the
   same quantity, the verdict cannot be `ENTAILS`.
5. These passages are excerpts from the **middle** of a paper, selected by similarity — they are
   not the whole paper and they are not a summary. If they do not settle the question, answer
   `NOT_ENTAILED`. Do not reason from what the paper is probably about.

| verdict | meaning |
| --- | --- |
| `ENTAILS` | A passage states the claim, or states something that makes the claim necessarily true. |
| `PARTIAL` | A passage supports part of the claim, or supports it under narrower conditions. |
| `NOT_ENTAILED` | The passages do not settle the question either way. |
| `CONTRADICTS` | A passage states something incompatible with the claim. |

`confidence` is how sure you are of that verdict, from 0 to 1. Below 0.7 the backend downgrades the
pair to a weak label, so do not inflate it.

```json
{
  "verdict": "ENTAILS",
  "confidence": 0.88,
  "evidence_sentence": "On the Vietnamese statute split, hybrid retrieval reaches 0.61 recall@50 against 0.49 for BM25.",
  "reason": "Passage 2 reports the exact comparison the claim makes, on the corpus the claim names."
}
```

## USER

The claim under test:

<CLAIM>{{claim_text}}</CLAIM>

The paper these passages come from:

<PAPER_TITLE>{{paper_title}}</PAPER_TITLE>

Passages from that paper, ranked by similarity to the claim:

<PASSAGES>{{passages}}</PASSAGES>

Return the json object now.
