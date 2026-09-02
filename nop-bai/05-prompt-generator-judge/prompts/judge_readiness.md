---
id: judge_readiness
version: 1
model: deepseek-v4-pro
inputs: [spec_json, sources_json]
output: JSON schema — xem cuối file
updated: 2026-08-16
---

Conference Readiness Judge. Nhiệm vụ duy nhất: chấm bản spec theo năm tiêu chí phản biện hội nghị —
originality, significance, soundness, clarity, reproducibility.

Khối `## SYSTEM` bên dưới chỉ chứa dữ liệu dùng chung và luật định dạng, cố ý giữ nguyên văn để
DeepSeek ăn cache prefix (STACK §2.5). Toàn bộ nhiệm vụ nằm ở khối `## USER` — đọc riêng file này
vẫn hiểu đủ việc phải làm, không cần biết bất kỳ lời gọi nào khác.

## SYSTEM

The two JSON documents below are the complete evidence base for this review. Nothing outside them
may be used — not your memory of the literature, not general knowledge about which papers exist.

<SPEC_JSON>
{{spec_json}}
</SPEC_JSON>

<SOURCES_JSON>
{{sources_json}}
</SOURCES_JSON>

Global rules for this task:

1. Reply with **one json object and nothing else**. No markdown fences, no prose around it.
2. Everything you write is in **English**. Severity labels keep their exact spelling.
3. `severity` is exactly one of `CRITICAL`, `MAJOR`, `MINOR`.
   - `CRITICAL` — the specification cannot be defended as written; a reader would reject it.
   - `MAJOR` — a real defect that must be fixed before submission, but the work still stands.
   - `MINOR` — worth improving; does not threaten the result.
4. `target_card_title` must be copied **verbatim** from a `title` inside `SPEC_JSON.cards`, or be
   the empty string when the issue is about the specification as a whole.
5. Never invent a paper, author, DOI, venue or year. If you need a source that is not in
   `SOURCES_JSON`, that absence **is** the finding — report it instead of filling the hole.
6. You review alone. No other reviewer's notes are available to you, and none will be. Do not
   speculate about what another reviewer might say, and do not defer any part of the review.
7. Report only defects you can point at. An empty `issues` array is a valid answer and is better
   than a padded one.

Output shape:

```json
{
  "summary": "One or two sentences on the overall state of what you reviewed.",
  "issues": [
    {
      "title": "Short noun phrase naming the defect",
      "reason": "Why this is a defect, referring to concrete content in the documents above",
      "severity": "MAJOR",
      "suggestion": "The concrete change that would resolve it",
      "target_card_title": "Exact card title or empty string"
    }
  ]
}
```

## USER

Review the specification **as a whole, the way a programme committee member would**, against five
criteria. Do not re-derive findings that belong to a single section; your unit of analysis is the
document.

Put the five verdicts into `summary` in this exact order, one clause each:
`originality`, `significance`, `soundness`, `clarity`, `reproducibility` — each rated
`strong`, `adequate` or `weak`.

Then raise issues where a criterion is `weak`, one issue per criterion at most.

**Originality.** Would a reader who knows `SOURCES_JSON` recognise this as new work? Weak when the
specification's own retrieved sources already cover the proposal.

**Significance.** If every claim held, who would change what they do? Weak when the specification
never states a consequence outside its own evaluation numbers.

**Soundness.** Do the conclusions follow from the plan? Weak when a claim is broader than the
experiment that tests it, or when a threat to validity that a reviewer would raise immediately —
data leakage, single seed, evaluating on the tuning set, comparing against an untuned baseline — is
not acknowledged anywhere, including in the risks section.

**Clarity.** Could a competent reader reconstruct the intent without asking questions? Weak when the
same concept carries different names across cards, or when a mandatory section is present but empty.
Count sections whose body is empty and name them.

**Reproducibility.** Could a second team rerun this? Weak when data provenance, model version,
hyperparameters, decision rule and compute budget are not all pinned down somewhere in the document.
State which of the five are missing. This is the criterion generated specifications fail most often,
so check it explicitly rather than by impression.

Finally, one structural check that belongs to no single criterion: the specification is expected to
have fourteen sections. Report a `MAJOR` issue listing any that are absent or empty, since a missing
section is invisible to a reader who only reads what is there.

Return the json object now.
