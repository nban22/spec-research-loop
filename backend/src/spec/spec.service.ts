import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { PrismaService } from '../common/prisma.service';
import { CLAIM_FIELDS, GAP_FIELDS } from '../contracts/card';
import { SPEC_SECTIONS, type SpecSection } from '../contracts/spec';
import {
  CARD_ROLE_PROPOSED_APPROACH,
  cardRole,
  experimentPlanBlobSchema,
  type ExperimentPlanBlob,
} from './spec.types';

type CardRow = {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  payload: unknown;
  order_index: number;
};

@Injectable()
export class SpecService {
  constructor(private readonly prisma: PrismaService) {}

  /** Kiểm quyền qua `Project.user_id` — bảng con join ngược về Project (STACK §11.3 luật 2). */
  async assertVersionOwned(specVersionId: string, userId: string) {
    const version = await this.prisma.specVersion.findFirst({
      where: { id: specVersionId, project: { user_id: userId } },
      include: { project: true },
    });
    if (!version) throw AppError.notFound('Không tìm thấy phiên bản spec.');
    return version;
  }

  async currentVersionOf(projectId: string) {
    const version = await this.prisma.specVersion.findFirst({
      where: { project_id: projectId },
      orderBy: { version_no: 'desc' },
    });
    if (!version) throw AppError.notFound('Dự án chưa có phiên bản spec nào.');
    return version;
  }

  async cards(
    specVersionId: string,
    filter?: { type?: string; status?: string },
  ) {
    return this.prisma.card.findMany({
      where: {
        spec_version_id: specVersionId,
        ...(filter?.type ? { type: filter.type as never } : {}),
        ...(filter?.status ? { status: filter.status as never } : {}),
      },
      orderBy: [{ type: 'asc' }, { order_index: 'asc' }],
      include: {
        card_sources: {
          select: {
            id: true,
            support_label: true,
            similarity: true,
            evidence_sentence: true,
            flags: true,
            override_reason: true,
            source: {
              select: {
                id: true,
                title: true,
                year: true,
                doi: true,
                url: true,
                venue: true,
                retrieved_from: true,
              },
            },
          },
        },
      },
    });
  }

  async experimentPlan(
    specVersionId: string,
  ): Promise<ExperimentPlanBlob | null> {
    const row = await this.prisma.experimentPlan.findUnique({
      where: { spec_version_id: specVersionId },
    });
    if (!row) return null;
    const parsed = experimentPlanBlobSchema.safeParse(row.plan);
    return parsed.success ? parsed.data : null;
  }

  /**
   * Dựng 14 mục của spec từ `Card` + `ExperimentPlan` + `ResourceEstimate` + `Decision`.
   * `present: false` cho mục rỗng — đó chính là metric `completeness_14` của báo cáo đánh giá.
   */
  async buildSections(specVersionId: string): Promise<SpecSection[]> {
    const [version, cards, plan, estimate] = await Promise.all([
      this.prisma.specVersion.findUniqueOrThrow({
        where: { id: specVersionId },
      }),
      this.cards(specVersionId),
      this.experimentPlan(specVersionId),
      this.prisma.resourceEstimate.findUnique({
        where: { spec_version_id: specVersionId },
      }),
    ]);

    const relatedRows = await this.prisma.relatedWorkRow.findMany({
      where: { spec_version_id: specVersionId },
      include: { source: true },
      orderBy: { order_index: 'asc' },
    });
    const decisions = await this.prisma.decision.findMany({
      where: { project_id: version.project_id },
      orderBy: { created_at: 'asc' },
    });

    const byType = (t: string) => cards.filter((c) => c.type === t);
    const bullets = (rows: CardRow[]) =>
      rows.map((c) => `- **${c.title}** — ${c.body || '_(empty)_'}`).join('\n');

    const approachCards = byType('CONTRIBUTION').filter(
      (c) => cardRole(c.payload) === CARD_ROLE_PROPOSED_APPROACH,
    );
    const contributionCards = byType('CONTRIBUTION').filter(
      (c) => cardRole(c.payload) !== CARD_ROLE_PROPOSED_APPROACH,
    );

    const gapBody = byType('GAP')
      .map((c) => {
        const p = (c.payload ?? {}) as Record<string, string>;
        const rows = GAP_FIELDS.map(
          (f) =>
            `  - _${labelOfGapField(f)}_: ${p[f]?.trim() || '**(missing)**'}`,
        ).join('\n');
        return `- **${c.title}**\n${rows}`;
      })
      .join('\n\n');

    const claimBody = byType('CLAIM')
      .map((c) => {
        const p = (c.payload ?? {}) as Record<string, string>;
        const support = c.card_sources
          .map(
            (cs) =>
              `${cs.support_label} — ${cs.source.title}${cs.source.year ? ` (${cs.source.year})` : ''}` +
              // Trích dẫn được giữ lại dù verifier bác: **đánh dấu ngay trong spec xuất ra**.
              // Đó là chỗ khác nhau giữa "bỏ qua có ghi nhận" và "không kiểm" (ARCHITECTURE §6.6).
              (cs.override_reason
                ? ` **[kept by user despite UNSUPPORTED: ${cs.override_reason}]**`
                : ''),
          )
          .join('; ');
        const rows = [
          `  - _Claim_: ${c.body || c.title}`,
          ...CLAIM_FIELDS.map(
            (f) =>
              `  - _${labelOfClaimField(f)}_: ${p[f]?.trim() || '**(missing)**'}`,
          ),
          `  - _Cited evidence_: ${support || '**(no source attached)**'}`,
        ].join('\n');
        return `- **${c.title}**\n${rows}`;
      })
      .join('\n\n');

    const relatedBody =
      relatedRows.length === 0
        ? ''
        : [
            '| Study | What it did | Feedback type | What is still missing | Source |',
            '| --- | --- | --- | --- | --- |',
            ...relatedRows.map((r) => {
              const cite = r.source.doi
                ? `[DOI](https://doi.org/${r.source.doi})`
                : r.source.url
                  ? `[link](${r.source.url})`
                  : r.source.external_id;
              return `| ${md(r.source.title)}${r.source.year ? ` (${r.source.year})` : ''} | ${md(r.what_done)} | ${md(r.feedback_type)} | ${md(r.what_missing)} | ${cite} |`;
            }),
          ].join('\n');

    const experimentBody = (plan?.experiments ?? [])
      .map(
        (e) =>
          `- **${e.code} — ${e.title}**\n${e.bullets.map((b) => `  - ${b}`).join('\n')}` +
          (e.linked_claim_title
            ? `\n  - _Tests claim_: ${e.linked_claim_title}`
            : ''),
      )
      .join('\n\n');

    const budgetBody = estimate
      ? [
          `- VRAM: **${estimate.vram_gb} GB** (${estimate.fits_rtx3090 ? 'fits' : 'does NOT fit'} a 24 GB RTX 3090)`,
          `- Wall-clock: **${estimate.hours_min}–${estimate.hours_max} h**`,
          `- Tokens: **${Math.round(estimate.tokens_est).toLocaleString('en-US')}**`,
          `- API cost: **~$${estimate.cost_usd}**`,
          estimate.downscale_suggestion
            ? `- Downscaling suggested: ${describeDownscale(estimate.downscale_suggestion)}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    const decisionBody =
      decisions.length === 0
        ? ''
        : decisions
            .map((d) => {
              const chosen = describeChoice(
                d.options,
                d.chosen_key,
                d.custom_text,
              );
              const when = d.created_at
                .toISOString()
                .replace('T', ' ')
                .slice(0, 16);
              return `- \`${when}\` · ${d.step} · **${d.chosen_key}** — ${chosen}${d.applied ? '' : ' _(not applied)_'}`;
            })
            .join('\n');

    const bodies: Record<string, string> = {
      problem_statement: bullets(byType('PROBLEM')),
      research_questions: bullets(byType('RESEARCH_QUESTION')),
      related_work_matrix: relatedBody,
      research_gap: gapBody,
      proposed_approach: approachCards.map((c) => c.body).join('\n\n'),
      expected_contributions: bullets(contributionCards),
      claim_evidence_matrix: claimBody,
      experimental_protocol: experimentBody,
      baselines_and_metrics: plan?.baselines_and_metrics ?? '',
      ablation_plan: plan?.ablation_plan ?? '',
      compute_budget: budgetBody,
      risks_and_limitations: plan?.risks_and_limitations ?? '',
      open_issues: bullets(byType('OPEN_QUESTION')),
      decision_history: decisionBody,
    };

    return SPEC_SECTIONS.map((s) => {
      const body = (bodies[s.key] ?? '').trim();
      return {
        no: s.no,
        key: s.key,
        title: s.title,
        body,
        present: body.length > 0,
      };
    });
  }

  async buildMarkdown(
    specVersionId: string,
    opts: { title?: string } = {},
  ): Promise<string> {
    const sections = await this.buildSections(specVersionId);
    const version = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: specVersionId },
      include: { project: { select: { title: true, raw_idea: true } } },
    });
    const title = opts.title ?? version.project.title;

    const lines = [
      `# ${title}`,
      '',
      `> Research Specification · version ${version.version_no}${version.label ? ` · ${version.label}` : ''}`,
      `> Generated by SpecResearch Loop on ${new Date().toISOString().slice(0, 10)}`,
      '',
      '---',
      '',
    ];
    for (const s of sections) {
      lines.push(`## ${s.no}. ${s.title}`, '');
      lines.push(s.body.length > 0 ? s.body : '_This section is empty._', '');
    }
    return lines.join('\n');
  }

  /**
   * Đầu vào của 5 judge. Dựng **đúng một lần** rồi băm — nếu mỗi judge tự dựng đầu vào riêng
   * thì `input_digest` sẽ khác nhau và bằng chứng độc lập biến mất (C3 · F.6).
   */
  async buildSpecJson(specVersionId: string): Promise<Record<string, unknown>> {
    const [version, cards, plan, estimate, sections] = await Promise.all([
      this.prisma.specVersion.findUniqueOrThrow({
        where: { id: specVersionId },
        include: {
          project: { select: { title: true, raw_idea: true, domain: true } },
        },
      }),
      this.cards(specVersionId),
      this.experimentPlan(specVersionId),
      this.prisma.resourceEstimate.findUnique({
        where: { spec_version_id: specVersionId },
      }),
      this.buildSections(specVersionId),
    ]);

    return {
      title: version.project.title,
      domain: version.project.domain,
      version_no: version.version_no,
      cards: cards.map((c) => ({
        title: c.title,
        type: c.type,
        status: c.status,
        body: c.body,
        payload: c.payload,
      })),
      card_sources: cards.flatMap((c) =>
        c.card_sources.map((cs) => ({
          card_title: c.title,
          source_id: cs.source.id,
          source_title: cs.source.title,
          support_label: cs.support_label,
          evidence_sentence: cs.evidence_sentence,
          flags: cs.flags ?? [],
        })),
      ),
      experiment_plan: plan,
      resource_estimate: estimate
        ? {
            vram_gb: estimate.vram_gb,
            hours_min: estimate.hours_min,
            hours_max: estimate.hours_max,
            tokens_est: estimate.tokens_est,
            cost_usd: estimate.cost_usd,
            fits_rtx3090: estimate.fits_rtx3090,
            inputs: estimate.inputs,
          }
        : null,
      sections: sections.map((s) => ({
        no: s.no,
        title: s.title,
        present: s.present,
      })),
    };
  }
}

function md(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function labelOfGapField(f: string): string {
  return (
    {
      prior_work: 'What prior work achieved',
      limitation: 'Remaining limitation',
      why_it_matters: 'Why that limitation matters',
      testable_experiment: 'Experiment that would test it',
    }[f] ?? f
  );
}

function labelOfClaimField(f: string): string {
  return (
    {
      baseline: 'Baseline',
      metric: 'Metric',
      evidence: 'Evidence',
      refutation_condition: 'Refutation condition',
    }[f] ?? f
  );
}

function describeDownscale(v: unknown): string {
  if (!Array.isArray(v)) return '';
  return v
    .map((s) => {
      const x = s as { field?: string; from?: unknown; to?: unknown };
      return `${x.field} ${String(x.from)} → ${String(x.to)}`;
    })
    .join('; ');
}

function describeChoice(
  options: unknown,
  chosenKey: string,
  customText: string | null,
): string {
  if (chosenKey === 'OTHER') return customText ?? '(Other, no reason given)';
  if (Array.isArray(options)) {
    const found = options.find(
      (o) => (o as { key?: string }).key === chosenKey,
    ) as { label?: string } | undefined;
    if (found?.label) return found.label;
  }
  return chosenKey;
}
