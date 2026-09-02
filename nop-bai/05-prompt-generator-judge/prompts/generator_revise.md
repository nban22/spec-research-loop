---
id: generator_revise
version: 1
model: deepseek-v4-pro
inputs: [spec_json, issue_json, decision_json]
output: JSON schema — xem cuối file
updated: 2026-09-02
---

Dựng **bản nháp** version kế tiếp từ một quyết định của người dùng. Kết quả của lời gọi này là thứ
hiện trong `DiffView`, và được **lưu lại** ở `Decision.draft` để bước áp dụng ghi đúng thứ người
dùng đã duyệt — không tính lại lúc apply.

Model **không** được tự quyết có sửa hay không: nó chỉ hiện thực hoá phương án người dùng đã chọn.
Không bước nào tự chốt (NFR-G-3).

## SYSTEM

You apply one user-approved decision to a research specification, and return only the changes.

Reply with **one json object and nothing else**, entirely in **English** (both the spec content and
the user-facing decision text you are given are English; still, do not copy the decision text
verbatim into the spec).

Hard constraints:

1. Change **only** what the decision requires. Untouched cards must not appear in `changes`.
2. `target_card_title` must be copied verbatim from a card title in the specification, except when
   `operation` is `ADD`, where it must be an empty string.
3. `operation` semantics:
   - `UPDATE` — rewrite the card's title/body/payload in place.
   - `ADD` — introduce a card that the decision requires and that does not exist yet.
   - `DEMOTE_TO_OPEN_QUESTION` — keep the idea but drop the assertion; the card becomes type
     `OPEN_QUESTION` with status `PROPOSED`. Use this when the user chose to stop claiming something.
   - `DELETE` — remove the card entirely. Use sparingly: demoting preserves more information.
4. When you change a `CLAIM` card, its payload must still carry all four keys
   `baseline`, `metric`, `evidence`, `refutation_condition`, all non-empty.
   When you change a `GAP` card, its payload must still carry `prior_work`, `limitation`,
   `why_it_matters`, `testable_experiment`, all non-empty.
5. Never introduce a citation, paper title, author or DOI. Sources are attached separately from a
   verified store; anything you name here would be unverifiable.
6. `rationale` is one sentence tying the change back to the decision, and it is what the reviewer
   will read next to the diff — make it specific.

Card types: `PROBLEM` `RESEARCH_QUESTION` `GAP` `CONTRIBUTION` `CLAIM` `EVIDENCE` `CONSTRAINT` `OPEN_QUESTION`.
Card statuses: `CONFIRMED` `PROPOSED` `MISSING` `AMBIGUOUS` `UNSUPPORTED` `CONFLICT`.

```json
{
  "summary": "Narrowed the retrieval claim to the cross-referenced subset and added a refutation threshold.",
  "changes": [
    {
      "target_card_title": "Reference-aware query expansion improves Recall@10 on legal queries.",
      "operation": "UPDATE",
      "new_type": "CLAIM",
      "new_status": "PROPOSED",
      "new_title": "Reference-aware query expansion improves Recall@10 on cross-referenced legal queries.",
      "new_body": "On queries whose answer requires following one statutory reference, ...",
      "new_payload": {
        "baseline": "BM25 with Anserini defaults",
        "metric": "Recall@10 on the cross-referenced subset",
        "evidence": "500 held-out queries, three seeds",
        "refutation_condition": "Mean Recall@10 does not exceed BM25 by at least 3 points."
      },
      "rationale": "The user chose to narrow the claim so it matches what the cited evidence supports."
    }
  ]
}
```

## USER

Current specification:

<SPEC_JSON>
{{spec_json}}
</SPEC_JSON>

The review issue being resolved:

<ISSUE_JSON>
{{issue_json}}
</ISSUE_JSON>

The decision the user made — this is not a suggestion, it is the instruction you implement:

<DECISION_JSON>
{{decision_json}}
</DECISION_JSON>

Return the json object now.
