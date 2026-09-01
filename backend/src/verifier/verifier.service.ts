import { Injectable, Logger } from '@nestjs/common';
import { entailmentOutputSchema } from '../contracts/llm-io/judge';
import { VERIFIABLE_CARD_TYPES } from '../contracts/card';
import type { VerifierFlag } from '../contracts/enums';
import { PrismaService } from '../common/prisma.service';
import { collapseWhitespace, splitSentences } from '../common/text';
import { ConflictService } from '../conflict/conflict.service';
import { LlmService } from '../llm/llm.service';
import { SourceClient } from '../sources/source.client';
import { EmbedderService, cosine } from './embedder.service';
import { FullTextService, type FullTextRunCache } from './fulltext.service';
import { claimsRecency, numbersMissingFromSource } from './numeric-guard';
import { DEFAULT_THRESHOLDS, type VerifierThresholds } from './thresholds';
import type { Entailment, SupportLabel } from '../generated/prisma/enums';

export type UnitResult = {
  cardSourceId: string;
  cardId: string;
  sourceId: string;
  label: SupportLabel;
  similarity: number | null;
  entailment: Entailment | null;
  confidence: number | null;
  evidenceSentence: string | null;
  flags: VerifierFlag[];
  usedL4: boolean;
};

export type VerifyResult = {
  verifierRunId: string;
  unitsTotal: number;
  unitsL4: number;
  labelCounts: Record<SupportLabel, number>;
  results: UnitResult[];
};

/**
 * Citation verifier — 5 tầng, **rẻ trước đắt sau** (ARCHITECTURE §6.3).
 * Ba tầng đầu chặn phần lớn lỗi mà không tốn một token API nào; LLM chỉ chạm vùng xám.
 * Đó chính là thứ biến verifier thành một cải tiến thay vì "gọi thêm một LLM nữa để kiểm tra LLM".
 */
@Injectable()
export class VerifierService {
  private readonly logger = new Logger(VerifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: EmbedderService,
    private readonly llm: LlmService,
    private readonly sourceClient: SourceClient,
    private readonly conflict: ConflictService,
    private readonly fulltext: FullTextService,
  ) {}

  async verifySpecVersion(
    specVersionId: string,
    opts: {
      cardIds?: string[];
      projectId?: string | null;
      evalRunId?: string | null;
      thresholds?: VerifierThresholds;
      onProgress?: (
        done: number,
        total: number,
        message: string,
      ) => Promise<void>;
    } = {},
  ): Promise<VerifyResult> {
    const th = opts.thresholds ?? DEFAULT_THRESHOLDS;

    /*
      #2 — cờ toàn văn đọc **đúng một lần** ở đây, và chỉ khi có `projectId`.
      Không đi đường `specVersion.findUniqueOrThrow({ include: { project } })`: lời gọi không kèm
      project (chỉ có trong test) phải giữ nguyên hành vi cũ, byte-identical.
    */
    const fulltextOn = opts.projectId
      ? await this.fulltext.isEnabled(opts.projectId)
      : false;
    if (fulltextOn) this.fulltext.beginRun();
    // Vector của đoạn sống đúng lần chạy này. Nhiều thẻ thường trích cùng một bài, và nhúng lại
    // 150 đoạn cho từng cặp là chỗ duy nhất làm vỡ mốc "không quá 2× thời gian" của #2.
    const ftCache: FullTextRunCache = new Map();

    const units = await this.prisma.cardSource.findMany({
      where: {
        card: {
          spec_version_id: specVersionId,
          type: { in: [...VERIFIABLE_CARD_TYPES] },
          // Có mảng ⇒ chỉ kiểm đúng những thẻ đó, **kể cả mảng rỗng** (0 unit).
          // Trước đây điều kiện là `cardIds?.length`, nên truyền `[]` với ý "không thẻ nào
          // cần kiểm lại" lại kiểm **toàn bộ** version — ngược hẳn ý gọi.
          ...(opts.cardIds ? { id: { in: opts.cardIds } } : {}),
        },
      },
      include: { card: true, source: true },
    });

    const run = await this.prisma.verifierRun.create({
      data: {
        spec_version_id: specVersionId,
        // Bộ ngưỡng được chép vào đây mỗi lần chạy, để nhãn cũ vẫn giải thích được
        // sau khi ngưỡng đổi (NFR-VER-4).
        config: { ...th },
        units_total: units.length,
        units_l4: 0,
        label_counts: {},
      },
      select: { id: true },
    });

    const results: UnitResult[] = [];
    const labelCounts: Record<SupportLabel, number> = {
      SUPPORTED: 0,
      WEAK: 0,
      UNSUPPORTED: 0,
    };
    let unitsL4 = 0;

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      await opts.onProgress?.(
        i,
        units.length,
        `Đang kiểm chứng cứ ${i + 1}/${units.length}…`,
      );

      const claimText = this.claimTextOf(
        u.card.title,
        u.card.body,
        u.card.payload,
      );
      const res = await this.verifyUnit(
        {
          cardSourceId: u.id,
          cardId: u.card_id,
          sourceId: u.source_id,
          claimText,
          abstract: u.source.abstract ?? '',
          doi: u.source.doi,
          externalId: u.source.external_id,
          doiVerified: u.source.doi_verified,
          year: u.source.year,
          // #2 — `include: { source: true }` đã nạp sẵn, không thêm truy vấn nào.
          sourceTitle: u.source.title,
          sourceUrl: u.source.url,
          retrievedFrom: u.source.retrieved_from,
          raw: u.source.raw,
        },
        th,
        {
          projectId: opts.projectId ?? null,
          specVersionId,
          evalRunId: opts.evalRunId ?? null,
          fulltextOn,
          verifierRunId: run.id,
          cache: ftCache,
        },
      );

      if (res.usedL4) unitsL4++;
      labelCounts[res.label]++;
      results.push(res);

      await this.prisma.cardSource.update({
        where: { id: u.id },
        data: {
          support_label: res.label,
          similarity: res.similarity,
          entailment: res.entailment,
          confidence: res.confidence,
          evidence_sentence: res.evidenceSentence,
          flags: res.flags,
          verifier_run_id: run.id,
        },
      });
    }

    await this.prisma.verifierRun.update({
      where: { id: run.id },
      data: { units_l4: unitsL4, label_counts: labelCounts },
    });

    /*
      Thứ tự **dọn → lan → quét** là bắt buộc, đừng "dọn cho gọn" thành hai dòng (#3):

      1. `clearForVersion` khôi phục `Card.status` về giá trị trước khi bị gán `CONFLICT`. Sau
         bước này không thẻ nào còn `CONFLICT`.
      2. Vì vậy nhánh `card.status === 'UNSUPPORTED' ? 'PROPOSED' : card.status` của
         `propagateCardStatus` không thể ghi đè lên một xung đột, cũng không thể để sót một
         xung đột đã cũ. Nhờ đó `propagateCardStatus` **không phải sửa một dòng nào**.
      3. `scanVersion` chạy sau cùng, trên nhãn đã chốt.

      Gói trong `if (opts.projectId)` vì cờ `conflict_detector` nằm trên `Project`: lời gọi
      không kèm project (chỉ có trong test) giữ nguyên hành vi cũ.
    */
    if (opts.projectId) {
      await this.conflict.clearForVersion(specVersionId);
      await this.propagateCardStatus(specVersionId);
      await this.conflict.scanVersion(specVersionId, opts.projectId);
    } else {
      await this.propagateCardStatus(specVersionId);
    }

    await opts.onProgress?.(
      units.length,
      units.length,
      'Đã kiểm xong chứng cứ.',
    );

    return {
      verifierRunId: run.id,
      unitsTotal: units.length,
      unitsL4,
      labelCounts,
      results,
    };
  }

  private claimTextOf(title: string, body: string, payload: unknown): string {
    const parts = [title, body];
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      for (const key of [
        'limitation',
        'why_it_matters',
        'metric',
        'evidence',
        'baseline',
      ]) {
        if (typeof p[key] === 'string' && p[key]) parts.push(p[key]);
      }
    }
    return parts.filter(Boolean).join(' ').trim();
  }

  private async verifyUnit(
    unit: {
      cardSourceId: string;
      cardId: string;
      sourceId: string;
      claimText: string;
      abstract: string;
      doi: string | null;
      externalId: string;
      doiVerified: boolean | null;
      year: number | null;
      sourceTitle: string;
      sourceUrl: string | null;
      retrievedFrom: string;
      raw: unknown;
    },
    th: VerifierThresholds,
    link: {
      projectId: string | null;
      specVersionId: string;
      evalRunId: string | null;
      fulltextOn: boolean;
      verifierRunId: string;
      cache: FullTextRunCache;
    },
  ): Promise<UnitResult> {
    const flags: VerifierFlag[] = [];
    const base = {
      cardSourceId: unit.cardSourceId,
      cardId: unit.cardId,
      sourceId: unit.sourceId,
    };

    // ── L0 · Nguồn có tồn tại? rule + HTTP, 0 token ────────────────────────────
    if (!unit.externalId) {
      return {
        ...base,
        label: 'UNSUPPORTED',
        similarity: null,
        entailment: null,
        confidence: null,
        evidenceSentence: null,
        flags: ['SOURCE_NOT_FOUND'],
        usedL4: false,
      };
    }
    if (unit.doi) {
      let verified = unit.doiVerified;
      if (verified === null) {
        verified = await this.sourceClient.verifyDoi(unit.doi);
        await this.prisma.source
          .update({
            where: { id: unit.sourceId },
            data: { doi_verified: verified },
          })
          .catch(() => undefined);
      }
      // Bằng chứng tồn tại của một nguồn có **hai** đường độc lập: mã của provider học thuật
      // (`external_id`, đã có ở trên) và DOI. Mất một cái vẫn còn một cái, nên DOI tra không ra
      // **không** đủ để kết luận nguồn là bịa — chỉ hạ độ tin cậy (SYSTEM_DESIGN_ANALYSIS §3.4).
      //
      // Đây là chỗ bản đầu chặt quá tay: nó cho `UNSUPPORTED` mọi paper arXiv, vì DOI arXiv
      // không nằm ở Crossref. Xem `SourceClient.verifyDoi`.
      if (verified !== true) flags.push('DOI_UNVERIFIED');
    }

    // ── L1 · Sanity metadata · rule, 0 token ──────────────────────────────────
    let capWeak = false;
    if (unit.abstract.trim().length < th.min_abstract_chars) {
      flags.push('EMPTY_ABSTRACT');
      capWeak = true;
    }
    if (
      claimsRecency(unit.claimText) &&
      unit.year !== null &&
      new Date().getFullYear() - unit.year > th.stale_years
    ) {
      flags.push('STALE_SOURCE'); // cảnh báo, không hạ nhãn
    }

    // ── L2 · Đối chiếu con số · rule, 0 token ─────────────────────────────────
    const missingNumbers = numbersMissingFromSource(
      unit.claimText,
      unit.abstract,
    );
    if (missingNumbers.length > 0) {
      flags.push('NUMBER_NOT_IN_SOURCE');
      capWeak = true;
    }

    // Abstract rỗng thì không có gì để embed hay đọc — dừng ở WEAK.
    // …trừ khi #2 lấy được toàn văn: nguồn không có abstract chính là nhóm hưởng lợi nhiều nhất.
    if (unit.abstract.trim().length === 0) {
      const ft = await this.tryFullText(unit, th, link, flags, base, null);
      if (ft) return ft;
      return {
        ...base,
        label: 'WEAK',
        similarity: null,
        entailment: null,
        confidence: null,
        evidenceSentence: null,
        flags,
        usedL4: false,
      };
    }

    // ── L3 · Embedding · CPU local, 0 token API ───────────────────────────────
    const sentences = splitSentences(unit.abstract);
    const pool = sentences.length > 0 ? sentences : [unit.abstract];
    let simMax = 0;
    let topSentences: string[] = pool.slice(0, 3);

    try {
      const vectors = await this.embedder.embed([unit.claimText, ...pool]);
      const claimVec = vectors[0];
      const scored = pool
        .map((s, i) => ({ s, sim: cosine(claimVec, vectors[i + 1]) }))
        .sort((a, b) => b.sim - a.sim);
      simMax = scored[0]?.sim ?? 0;
      topSentences = scored.slice(0, 3).map((x) => x.s);
    } catch (err) {
      // **Fail-closed**: không kiểm được thì không được coi là đã kiểm (C2 · F.8).
      this.logger.error(
        `Embedding lỗi, hạ nhãn về WEAK: ${err instanceof Error ? err.message : String(err)}`,
      );
      flags.push('LLM_UNAVAILABLE');
      return {
        ...base,
        label: 'WEAK',
        similarity: null,
        entailment: null,
        confidence: null,
        evidenceSentence: null,
        flags,
        usedL4: false,
      };
    }

    /*
      ── L3b · Leo thang xuống toàn văn · chỉ khi abstract không kết luận nổi (#2) ───────────
      `clearlySupported` phải được tính **trước** khi bất kỳ cờ mới nào được push. Nếu không,
      `FULLTEXT_UNAVAILABLE` sẽ đầu độc điều kiện `flags.filter(...).length === 0` ở đường tắt
      bên dưới và âm thầm đẩy những cặp `SUPPORTED` sạch xuống L4. Đây là cái bẫy nguy hiểm
      nhất của tính năng này.
    */
    const clearlySupported =
      simMax >= th.tau_high &&
      flags.filter((f) => f !== 'STALE_SOURCE').length === 0;
    if (!clearlySupported) {
      const ft = await this.tryFullText(unit, th, link, flags, base, simMax);
      if (ft) return ft;
    }

    if (simMax < th.tau_low) {
      return {
        ...base,
        label: 'UNSUPPORTED',
        similarity: simMax,
        entailment: null,
        confidence: null,
        evidenceSentence: null,
        flags,
        usedL4: false,
      };
    }
    if (
      simMax >= th.tau_high &&
      flags.filter((f) => f !== 'STALE_SOURCE').length === 0
    ) {
      return {
        ...base,
        label: 'SUPPORTED',
        similarity: simMax,
        entailment: null,
        confidence: null,
        evidenceSentence: null,
        flags,
        usedL4: false,
      };
    }

    // ── L4 · LLM entailment · chỉ chạm vùng xám ───────────────────────────────
    let verdict: Entailment = 'NOT_ENTAILED';
    let confidence = 0;
    let evidenceSentence: string | null = null;
    try {
      const out = await this.llm.completeJson({
        promptId: 'verifier_entailment',
        schema: entailmentOutputSchema,
        model: 'deepseek-v4-flash',
        purpose: 'ENTAILMENT',
        reasoningEffort: 'low',
        maxTokens: 1200,
        variables: {
          claim_text: unit.claimText,
          abstract: unit.abstract,
          top_sentences: topSentences
            .map((s, i) => `${i + 1}. ${s}`)
            .join('\n'),
        },
        link: {
          projectId: link.projectId,
          specVersionId: link.specVersionId,
          evalRunId: link.evalRunId,
        },
      });
      verdict = out.data.verdict;
      confidence = out.data.confidence;
      evidenceSentence = out.data.evidence_sentence;
    } catch (err) {
      this.logger.warn(
        `L4 lỗi, đơn vị này nhận WEAK: ${err instanceof Error ? err.message : String(err)}`,
      );
      flags.push('LLM_UNAVAILABLE');
      return {
        ...base,
        label: 'WEAK',
        similarity: simMax,
        entailment: null,
        confidence: null,
        evidenceSentence: null,
        flags,
        usedL4: true,
      };
    }

    // ── L4b · Chống bịa trích dẫn · rule kiểm output của LLM ──────────────────
    if (evidenceSentence && evidenceSentence.trim().length > 0) {
      const inAbstract = collapseWhitespace(unit.abstract).includes(
        collapseWhitespace(evidenceSentence),
      );
      if (!inAbstract) {
        flags.push('FABRICATED_QUOTE');
        verdict = 'NOT_ENTAILED';
      }
    } else {
      evidenceSentence = null;
    }

    // ── L5 · Bảng quyết định nhãn · luật đầu tiên khớp thì dừng ───────────────
    const label = decideLabel({ verdict, confidence, capWeak, th });

    return {
      ...base,
      label,
      similarity: simMax,
      entailment: verdict,
      confidence,
      evidenceSentence,
      flags,
      usedL4: true,
    };
  }

  /**
   * ── L3b · Verifier đọc toàn văn bài báo thay vì abstract (#2) ─────────────────
   *
   * Trả `null` ⇒ **không dùng được toàn văn**, bên gọi đi tiếp đúng đường abstract cũ, không đổi
   * một byte nào. Bốn lý do trả `null`: cờ tắt · nguồn không phải arXiv · hết ngân sách tải ·
   * tải hoặc bóc chữ hỏng. Cờ `FULLTEXT_UNAVAILABLE` **chỉ** bật ở hai lý do cuối — gắn cờ cho
   * "không phải arXiv" thì 60% số cặp mang theo một cái cờ vô nghĩa.
   */
  private async tryFullText(
    unit: {
      cardSourceId: string;
      sourceId: string;
      claimText: string;
      abstract: string;
      sourceTitle: string;
      sourceUrl: string | null;
      retrievedFrom: string;
      externalId: string;
      doi: string | null;
      raw: unknown;
    },
    th: VerifierThresholds,
    link: {
      projectId: string | null;
      specVersionId: string;
      evalRunId: string | null;
      fulltextOn: boolean;
      verifierRunId: string;
      cache: FullTextRunCache;
    },
    flags: VerifierFlag[],
    base: { cardSourceId: string; cardId: string; sourceId: string },
    abstractSim: number | null,
  ): Promise<UnitResult | null> {
    if (!link.fulltextOn) return null;

    const { text, status } = await this.fulltext.textFor({
      id: unit.sourceId,
      retrieved_from: unit.retrievedFrom,
      external_id: unit.externalId,
      doi: unit.doi,
      url: unit.sourceUrl,
      raw: unit.raw,
    });

    if (status === 'NOT_ARXIV') return null;
    if (status !== 'OK' || text.length === 0) {
      // Fail-closed **có tiếng nói**: hạ về đường abstract nhưng để lại dấu vết truy được.
      flags.push('FULLTEXT_UNAVAILABLE');
      return null;
    }

    const picks = await this.fulltext.topPassages(
      unit.sourceId,
      text,
      unit.claimText,
      link.cache,
    );
    if (picks.length === 0) {
      flags.push('FULLTEXT_UNAVAILABLE');
      return null;
    }

    flags.push('FULLTEXT_USED');
    // Chỉ đoạn thật sự gửi lên L4 mới là phạm vi đối chiếu — không phải 60.000 ký tự toàn văn.
    const quoteScope = picks.map((p) => p.passage.text).join('\n\n');

    /*
      L2 chạy lại trên `abstract + các đoạn đã chọn`.

      Không phải abstract: claim trích số từ Table 3 sẽ dính `NUMBER_NOT_IN_SOURCE` rồi bị hạ trần
      xuống WEAK, nên toàn văn không bao giờ nâng nổi nhãn — đúng loại claim định lượng mà tính
      năng này sinh ra để phục vụ. Cũng không phải cả tài liệu: trên 60.000 ký tự thì dung sai làm
      tròn khiến "trúng" gần như chắc chắn, và check 0-token mạnh nhất của hệ thống thành vô nghĩa.

      Đoạn-đã-chọn giữ đúng nghĩa gốc của tầng L2: **con số phải nằm ở chỗ có bằng chứng.**
      Một con số abstract không có mà phần kết quả có sẽ **xoá được** cờ — đó chính là màn demo.
    */
    const missing = numbersMissingFromSource(
      unit.claimText,
      `${unit.abstract}\n${quoteScope}`,
    );
    const kept = flags.filter((f) => f !== 'NUMBER_NOT_IN_SOURCE');
    flags.length = 0;
    flags.push(...kept);
    if (missing.length > 0) flags.push('NUMBER_NOT_IN_SOURCE');
    // `EMPTY_ABSTRACT` giữ làm cảnh báo nhưng **thôi hạ trần**: cái trần đó sinh ra vì không có gì
    // để đọc, mà giờ có cả bài báo.
    const capWeakFt = missing.length > 0;

    const simMax = picks[0].similarity;
    let verdict: Entailment = 'NOT_ENTAILED';
    let confidence = 0;
    let evidenceSentence: string | null = null;

    try {
      const out = await this.llm.completeJson({
        promptId: 'verifier_passage',
        schema: entailmentOutputSchema,
        model: 'deepseek-v4-flash',
        purpose: 'ENTAILMENT',
        reasoningEffort: 'low',
        maxTokens: 1200,
        variables: {
          claim_text: unit.claimText,
          paper_title: unit.sourceTitle,
          passages: picks
            .map((p, i) => `[${i + 1}] ${p.passage.text}`)
            .join('\n\n'),
        },
        link: {
          projectId: link.projectId,
          specVersionId: link.specVersionId,
          evalRunId: link.evalRunId,
        },
      });
      verdict = out.data.verdict;
      confidence = out.data.confidence;
      evidenceSentence = out.data.evidence_sentence;
    } catch (err) {
      this.logger.warn(
        `L3b lỗi, đơn vị này nhận WEAK: ${err instanceof Error ? err.message : String(err)}`,
      );
      flags.push('LLM_UNAVAILABLE');
      return {
        ...base,
        label: 'WEAK',
        similarity: abstractSim,
        entailment: null,
        confidence: null,
        evidenceSentence: null,
        flags,
        usedL4: true,
      };
    }

    // L4b nguyên vẹn, chỉ đổi **văn bản đối chiếu** từ abstract sang các đoạn đã gửi đi.
    if (evidenceSentence && evidenceSentence.trim().length > 0) {
      const inPassages = collapseWhitespace(quoteScope).includes(
        collapseWhitespace(evidenceSentence),
      );
      if (!inPassages) {
        flags.push('FABRICATED_QUOTE');
        verdict = 'NOT_ENTAILED';
      }
    } else {
      evidenceSentence = null;
    }

    await this.fulltext.recordPassages(
      link.verifierRunId,
      unit.cardSourceId,
      picks,
      evidenceSentence,
    );

    return {
      ...base,
      label: decideLabel({ verdict, confidence, capWeak: capWeakFt, th }),
      // Ở chế độ toàn văn đây là độ tương đồng **theo đoạn**, không phải theo câu abstract.
      // Cờ `FULLTEXT_USED` là thứ nói cho người đọc biết con số này đang ở thang nào.
      similarity: simMax,
      entailment: verdict,
      confidence,
      evidenceSentence,
      flags,
      usedL4: true,
    };
  }

  /** Thẻ có **mọi** nguồn `UNSUPPORTED` → `Card.status = UNSUPPORTED` (ARCHITECTURE §6.2). */
  private async propagateCardStatus(specVersionId: string): Promise<void> {
    const cards = await this.prisma.card.findMany({
      where: {
        spec_version_id: specVersionId,
        type: { in: [...VERIFIABLE_CARD_TYPES] },
      },
      include: { card_sources: { select: { support_label: true } } },
    });

    for (const card of cards) {
      if (card.card_sources.length === 0) continue;
      const allUnsupported = card.card_sources.every(
        (cs) => cs.support_label === 'UNSUPPORTED',
      );
      const nextStatus = allUnsupported
        ? 'UNSUPPORTED'
        : card.status === 'UNSUPPORTED'
          ? 'PROPOSED'
          : card.status;
      if (nextStatus !== card.status) {
        await this.prisma.card.update({
          where: { id: card.id },
          data: { status: nextStatus },
        });
      }
    }
  }

  async getVerification(specVersionId: string) {
    const pairs = await this.prisma.cardSource.findMany({
      where: { card: { spec_version_id: specVersionId } },
      include: {
        card: { select: { id: true, title: true, type: true, status: true } },
        source: {
          select: {
            id: true,
            title: true,
            year: true,
            doi: true,
            url: true,
            venue: true,
          },
        },
      },
    });

    const summary = { SUPPORTED: 0, WEAK: 0, UNSUPPORTED: 0 };
    for (const p of pairs) summary[p.support_label]++;

    return {
      pairs: pairs.map((p) => ({
        id: p.id,
        card: p.card,
        source: p.source,
        support_label: p.support_label,
        similarity: p.similarity,
        entailment: p.entailment,
        confidence: p.confidence,
        evidence_sentence: p.evidence_sentence,
        flags: (p.flags as VerifierFlag[] | null) ?? [],
      })),
      summary,
    };
  }
}

/** Bảng quyết định L5 (ARCHITECTURE §6.5) — áp từ trên xuống, luật đầu tiên khớp thì dừng. */
export function decideLabel(input: {
  verdict: Entailment;
  confidence: number;
  capWeak: boolean;
  th: VerifierThresholds;
}): SupportLabel {
  const { verdict, confidence, capWeak, th } = input;
  if (verdict === 'CONTRADICTS') return 'UNSUPPORTED';
  if (verdict === 'NOT_ENTAILED') return 'UNSUPPORTED';
  if (capWeak) return 'WEAK';
  if (verdict === 'PARTIAL') return 'WEAK';
  if (verdict === 'ENTAILS' && confidence < th.conf_min) return 'WEAK';
  return 'SUPPORTED';
}
