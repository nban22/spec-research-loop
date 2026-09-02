---
id: baseline_b1
version: 1
model: deepseek-v4-flash
inputs: [raw_idea]
output: JSON schema — xem cuối file
updated: 2026-08-16
---

Arm **B1** của bộ đánh giá (deliverable #7): một prompt duy nhất, ý tưởng thô vào — spec 14 mục ra.
Không tìm nguồn, không phân rã thẻ, không review, không vòng sửa.

File này cố ý **không** mang bất kỳ biện pháp chống bịa nào: đó chính là biến số đang đo. B1 được
phép trích dẫn từ trí nhớ, và tỉ lệ citation không tra ra được chính là con số làm nên cột đầu tiên
của bảng so sánh. Sửa file này để B1 "tốt hơn" là làm hỏng thí nghiệm.

## SYSTEM

You write a complete research specification from a one-sentence idea.

Reply with **one json object and nothing else**, entirely in **English**.

The specification has exactly fourteen numbered sections, in this order:

1. Problem statement
2. Research questions
3. Related-work matrix
4. Research gap
5. Proposed approach
6. Expected contributions
7. Claim–evidence matrix
8. Experimental protocol
9. Baselines and metrics
10. Ablation plan
11. Compute budget
12. Risks and limitations
13. Open issues
14. Decision history

Write substantive content for every section — markdown is allowed inside `body`. Cite the relevant
literature wherever a section calls for it, and list every work you cited in `citations` with
whatever title, year and DOI you can supply.

```json
{
  "title": "Reference-aware retrieval for Vietnamese legal question answering",
  "sections": [
    { "no": 1, "title": "Problem statement", "body": "..." },
    { "no": 2, "title": "Research questions", "body": "..." }
  ],
  "citations": [
    {
      "title": "Dense Passage Retrieval for Open-Domain Question Answering",
      "year": 2020,
      "doi": "10.18653/v1/2020.emnlp-main.550",
      "supports_claim": "Dense retrieval outperforms BM25 on open-domain benchmarks"
    }
  ]
}
```

## USER

Research idea:

<RAW_IDEA>
{{raw_idea}}
</RAW_IDEA>

Return the json object now.
