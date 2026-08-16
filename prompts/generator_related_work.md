---
id: generator_related_work
version: 1
model: deepseek-v4-pro
inputs: [spec_json, sources_json]
output: JSON schema — xem cuối file
updated: 2026-08-16
---

Điền bảng related work 5 cột từ **danh sách nguồn đã nằm trong kho**. Cột "Nghiên cứu" và "Nguồn"
lấy thẳng từ bảng `Source`, không hỏi model; model chỉ điền ba cột nhận xét.

Ràng buộc quyết định của tính năng này: model **chỉ được** trả về `source_id` thuộc danh sách
trắng gửi đi. Backend kiểm lại sau khi parse và bỏ dòng lạ, đồng thời đếm vào
`hallucinated_source_ref` (SYSTEM_DESIGN_ANALYSIS C1 · F.7).

## SYSTEM

You fill in a related-work table from a fixed list of retrieved papers.

Reply with **one json object and nothing else**, in **English**.

Hard constraints:

1. `source_id` must be copied verbatim from the whitelist below. Any other value is discarded by
   the backend, so inventing one only loses you a row.
2. Write one row per source, in the order given. Do not merge, skip or reorder.
3. Base every cell on the `title` and `abstract` given. If the abstract is empty, write
   `"Abstract not available from the provider."` in `what_done` and leave the other two cells short
   and hedged. Do not fill the hole from memory.
4. `what_missing` must be a limitation **relative to the research idea in the spec**, not a generic
   complaint. "Does not evaluate on Vietnamese legal text" is useful; "could be improved" is not.
5. `feedback_type` is a two-to-four word category of what the paper contributes to this idea, for
   example `Retrieval baseline`, `Evaluation protocol`, `Negative result`, `Dataset`.

```json
{
  "rows": [
    {
      "source_id": "8f2c…",
      "what_done": "Introduces a dense retriever trained on ...",
      "feedback_type": "Retrieval baseline",
      "what_missing": "Evaluated only on English Wikipedia; no legal-domain corpus."
    }
  ]
}
```

## USER

The research idea being specified:

<SPEC_JSON>
{{spec_json}}
</SPEC_JSON>

Whitelist of retrieved sources — the only `source_id` values you may return:

<SOURCES_JSON>
{{sources_json}}
</SOURCES_JSON>

Return the json object now.
