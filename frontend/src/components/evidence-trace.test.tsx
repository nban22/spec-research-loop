import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceTraceView } from './evidence-trace';
import type { ApiEvidencePair, ApiEvidenceTrace } from '@/lib/use-project';

/**
 * Four things worth locking down at this layer:
 *
 * 1. **The thresholds shown belong to that run**, not to today's constants — the explicit
 *    requirement of #5 and the whole reason NFR-VER-4 copies them into every `VerifierRun`.
 * 2. **Every label traces back to the layer that decided it.**
 * 3. Explanations and flags appear as **text**, never hidden behind hover (DS §6.7).
 * 4. The filters genuinely narrow, and do not break when the result is empty.
 */

const pair = (over: Partial<ApiEvidencePair> = {}): ApiEvidencePair => ({
  card_source_id: 'cs-1',
  card: { id: 'c-1', title: 'Hybrid retrieval helps', type: 'CLAIM', status: 'PROPOSED' },
  source: {
    id: 's-1',
    title: 'A paper about retrieval',
    year: 2024,
    doi: '10.1/x',
    url: null,
    venue: 'SIGIR',
  },
  support_label: 'SUPPORTED',
  verified: true,
  similarity: 0.812,
  entailment: null,
  confidence: null,
  evidence_sentence: null,
  flags: [],
  layer: 'L3',
  layer_why: 'The closest sentence in the source reached 0.81 similarity, above the upper threshold.',
  credibility: null,
  passages: [],
  ...over,
});

const data = (over: Partial<ApiEvidenceTrace> = {}): ApiEvidenceTrace => ({
  // Thresholds deliberately **different** from the defaults, so the test catches a hardcoded constant.
  thresholds: {
    tau_low: 0.4,
    tau_high: 0.76,
    conf_min: 0.8,
    title_match: 0.85,
    min_abstract_chars: 200,
    stale_years: 8,
  },
  run: { id: 'vr-1', created_at: '2026-08-31T00:00:00Z', units_total: 4, units_l4: 1 },
  summary: { SUPPORTED: 1, WEAK: 0, UNSUPPORTED: 0 },
  unverified: 0,
  pairs: [pair()],
  ...over,
});

/** A freshly generated pair: the `WEAK` label is the schema default and the verifier never touched it. */
const unverifiedPair = () =>
  pair({
    card_source_id: 'cs-2',
    card: { id: 'c-2', title: 'Never verified', type: 'CLAIM', status: 'PROPOSED' },
    support_label: 'WEAK',
    verified: false,
    similarity: null,
    layer: null,
    layer_why:
      'This pair has never been through evidence verification, so it has no label. The WEAK shown is the database default, not a verifier conclusion.',
  });

describe('the why-this-label page', () => {
  it('shows the thresholds of that particular run, not today constants', () => {
    // A pair with a model verdict, so all three thresholds surface in one place.
    render(
      <EvidenceTraceView
        data={data({
          pairs: [pair({ entailment: 'ENTAILS', confidence: 0.91, layer: 'L4' })],
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Hybrid retrieval helps/ }));
    expect(screen.getByText(/lower threshold 0.4/)).toBeInTheDocument();
    expect(screen.getByText(/upper threshold 0.76/)).toBeInTheDocument();
    expect(screen.getByText(/minimum 0.8/)).toBeInTheDocument();
  });

  it('traces every label back to the layer that decided it', () => {
    render(<EvidenceTraceView data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: /Hybrid retrieval helps/ }));
    const step = screen.getByRole('listitem', { current: 'step' });
    expect(step).toHaveTextContent('L3');
    expect(screen.getByText(/above the upper threshold/)).toBeInTheDocument();
  });

  it('renders diagnostic flags as sentences, not bare enum codes', () => {
    render(
      <EvidenceTraceView
        data={data({ pairs: [pair({ flags: ['FULLTEXT_USED'], layer: 'L3b' })] })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Hybrid retrieval helps/ }));
    expect(
      screen.getByText(/^· This label was read from the full paper/),
    ).toBeInTheDocument();
  });

  it('shows the full-text passages and marks the one holding the quote', () => {
    render(
      <EvidenceTraceView
        data={data({
          pairs: [
            pair({
              layer: 'L3b',
              evidence_sentence: 'We presented the Transformer.',
              passages: [
                {
                  rank: 0,
                  similarity: 0.78,
                  char_start: 10,
                  text: 'Some other passage.',
                  is_evidence: false,
                },
                {
                  rank: 1,
                  similarity: 0.77,
                  char_start: 90,
                  text: 'We presented the Transformer.',
                  is_evidence: true,
                },
              ],
            }),
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Hybrid retrieval helps/ }));
    expect(screen.getByText(/contains the quoted sentence/)).toBeInTheDocument();
  });

  /**
   * Three properties of an **unverified** pair — the thing that makes the whole card board at
   * step 3 look as though the verifier scored it and scored it badly, while it never ran at all.
   */
  it('shows UNVERIFIED rather than WEAK for an unverified pair', () => {
    render(<EvidenceTraceView data={data({ pairs: [unverifiedPair()], unverified: 1 })} />);
    expect(screen.getByText('UNVERIFIED')).toBeInTheDocument();
    expect(screen.queryByText('WEAK')).toBeNull();
  });

  it('draws no layer bar for an unverified pair — no layer ever touched it', () => {
    render(<EvidenceTraceView data={data({ pairs: [unverifiedPair()], unverified: 1 })} />);
    fireEvent.click(screen.getByRole('button', { name: /Never verified/ }));
    expect(screen.queryByRole('list', { name: 'Path through the verifier layers' })).toBeNull();
    expect(screen.getByText(/never been through evidence verification/)).toBeInTheDocument();
  });

  it('keeps unverified pairs out of the "Weak" filter and catches them with "Unverified"', () => {
    render(
      <EvidenceTraceView
        data={data({ pairs: [pair(), unverifiedPair()], unverified: 1 })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Weak' }));
    expect(screen.getByText(/No pair matches these filters/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unverified' }));
    expect(screen.getByText('Never verified')).toBeInTheDocument();
    expect(screen.queryByText('Hybrid retrieval helps')).toBeNull();
  });

  it('narrows the list by label and does not break when empty', () => {
    render(<EvidenceTraceView data={data()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unsupported' }));
    expect(screen.getByText(/No pair matches these filters/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Hybrid retrieval helps')).toBeInTheDocument();
  });
});
