---
id: judge_overclaim
version: 1
model: deepseek-v4-pro
inputs: [claim_json, plan_json, rule_signals_json]
output: JSON schema — xem cuối file
updated: 2026-08-29
---

Overclaim Judge. Nhiệm vụ duy nhất: **một** khẳng định có hứa rộng hơn thứ kế hoạch thí nghiệm
chứng minh được hay không.

Prompt này chỉ chạy cho **vùng xám** — trường hợp tầng luật 0 token đã bắt được dấu hiệu nhưng
không đủ chắc để kết luận. Trường hợp rõ ràng đã bị chặn trước, không tới đây.

Khối `## SYSTEM` chứa dữ liệu và luật định dạng, giữ nguyên văn để DeepSeek ăn cache prefix
(STACK §2.5). Nhiệm vụ nằm trọn ở `## USER` — đọc riêng file này vẫn hiểu đủ việc phải làm, không
cần biết bất kỳ judge nào khác.

## SYSTEM

Three JSON documents below are the complete evidence base. Nothing outside them may be used — not
your memory of the literature, not general knowledge about what usually works.

<CLAIM_JSON>
{{claim_json}}
</CLAIM_JSON>

<PLAN_JSON>
{{plan_json}}
</PLAN_JSON>

<RULE_SIGNALS_JSON>
{{rule_signals_json}}
</RULE_SIGNALS_JSON>

`CLAIM_JSON` is the single claim under review. `PLAN_JSON` is the experiment plan that is supposed
to back it. `RULE_SIGNALS_JSON` is what a zero-token rule pass already found: the scope and
magnitude phrases it matched, and the domain / dataset / model counts it could evidence in the
plan. Treat those counts as a floor, not a ceiling — the rule pass deliberately under-counts.

Global rules for this task:

1. Reply with **one json object and nothing else**. No markdown fences, no prose around it.
2. Everything you write is in **English**. Enum values keep their exact spelling.
3. `level` is exactly one of `NONE`, `MINOR`, `MAJOR`, `CRITICAL`.
   - `CRITICAL` — the claim promises a scope the plan cannot touch at all; a reviewer would call it
     unsupported on sight.
   - `MAJOR` — the claim is broader than the plan proves, but a narrower version survives.
   - `MINOR` — wording is loose; the substance is defensible.
   - `NONE` — the plan does back the claim as written. This is a valid, expected answer.
4. `recommended_exit` is exactly one of `NARROW_CLAIM`, `EXPAND_EXPERIMENT`, `TO_RESEARCH_QUESTION`.
5. `suggested_narrowing` must be **a sentence the author can paste in place of the claim**, not
   advice about how to rewrite it. Write the replacement sentence itself. When `level` is `NONE`,
   use the empty string.
6. `offending_phrases` must be copied **verbatim** from the claim text. Do not paraphrase. Empty
   array when `level` is `NONE`.
7. Judge only what the documents say. If the plan is silent on something the claim asserts, that
   silence **is** the finding — report it rather than assuming the author meant to cover it.
8. You review alone. No other reviewer's notes exist. Do not defer any part of this judgement.

Output shape:

```json
{
  "level": "MAJOR",
  "confidence": 0.0,
  "rationale": "Why the claim outruns the plan, pointing at concrete content in both documents",
  "suggested_narrowing": "The replacement sentence, ready to paste",
  "recommended_exit": "NARROW_CLAIM",
  "offending_phrases": ["exact substring from the claim"]
}
```

## USER

Review **only this one claim** against **only this one plan**. Do not comment on the gap, the
contribution wording, the citations, or the presentation — those are out of scope entirely.

Work through three questions in order.

**1. What scope does the claim assert?** Read the claim text and name the breadth it promises along
three axes: how many domains, how many datasets, how many models. A claim may assert breadth
without counting — "works across domains", "domain-agnostic", "for any input" all assert an
unbounded axis. Record which axes it bounds and which it leaves open.

**2. What scope does the plan actually establish?** Read every experiment, its bullets, and the
baselines and metrics. Count only what is named and runnable. A plan that says "we will evaluate on
additional domains" establishes nothing on that axis — intent is not evidence. A plan whose
experiments all draw from one corpus establishes one dataset, however many times it is mentioned.

**3. Does the assertion outrun the evidence?** Compare axis by axis.

Assign `CRITICAL` when the claim asserts an unbounded axis and the plan establishes exactly one
value on it — the brief's own example is a method claimed to work across many domains while every
experiment sits in a single domain.

Assign `MAJOR` when the claim asserts a bounded scope larger than the plan establishes, or asserts
a magnitude of improvement ("significantly", "far exceeds") that no baseline in the plan can
measure.

Assign `MINOR` when the scope matches but the wording invites a broader reading than intended — a
missing qualifier rather than a missing experiment.

Assign `NONE` when each asserted axis is matched by named, runnable evidence. Do not manufacture a
defect to look thorough; the rule pass already flagged this claim as worth a second look, and
overturning that flag is a useful answer.

Then choose `recommended_exit` by what would cost the author least while making the claim honest:

- `NARROW_CLAIM` — the result is real but smaller than stated. Default choice when a narrower
  sentence is still worth publishing.
- `EXPAND_EXPERIMENT` — the claim is worth its breadth and the missing experiments are plausibly
  runnable within the plan's stated resources.
- `TO_RESEARCH_QUESTION` — neither the evidence nor a reasonable extension of the plan can support
  the claim at any useful scope. Demote it to an open question rather than shrink it to a triviality.

Finally write `suggested_narrowing`. Take the original claim sentence and rewrite it so every
asserted axis is bounded by something `PLAN_JSON` names. Keep the author's own vocabulary. Change
scope, not substance — the sentence must still say something worth claiming.

Return the json object now.
