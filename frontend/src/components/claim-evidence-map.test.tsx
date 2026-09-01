import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClaimEvidenceMap, type ClaimCard } from './claim-evidence-map';
import type { ApiSource } from '@/lib/types';

/**
 * These test the **contract**, not the drag-and-drop mechanism.
 *
 * Real dragging needs mouse coordinates, `PointerEvent`, and layout measurement — jsdom gives
 * trustworthy results for none of those, so a drag test here would only create false confidence.
 * What is worth locking down:
 *
 * 1. **Dragging is not the only path** — every action has a real button, usable by finger and by
 *    keyboard (frontend/CLAUDE.md §7).
 * 2. **A dangling claim must be visible** — that is why this screen exists.
 * 3. Every button has a **name**, not a bare icon.
 */

const source = (over: Partial<ApiSource> = {}): ApiSource => ({
  id: 's-1',
  title: 'Neural machine translation with attention',
  authors: ['A'],
  year: 2020,
  venue: 'ACL',
  doi: null,
  url: null,
  abstract: null,
  citation_count: 10,
  retrieved_from: 'SEMANTIC_SCHOLAR',
  doi_verified: true,
  ...over,
});

const claim = (over: Partial<ClaimCard> = {}): ClaimCard => ({
  id: 'c-1',
  title: 'The proposed model cuts translation errors by 20%',
  status: 'PROPOSED',
  type: 'CLAIM',
  card_sources: [],
  ...over,
});

const linked = (over: Partial<ClaimCard['card_sources'][number]> = {}) => ({
  id: 'cs-1',
  support_label: 'SUPPORTED' as const,
  flags: null,
  source: { id: 's-1', title: 'Neural machine translation with attention', year: 2020 },
  ...over,
});

function setup(props: Partial<Parameters<typeof ClaimEvidenceMap>[0]> = {}) {
  const onLink = vi.fn();
  const onUnlink = vi.fn();
  const onDeleteCard = vi.fn();
  render(
    <ClaimEvidenceMap
      claims={[claim()]}
      sources={[source()]}
      onLink={onLink}
      onUnlink={onUnlink}
      onDeleteCard={onDeleteCard}
      {...props}
    />,
  );
  return { onLink, onUnlink, onDeleteCard };
}

describe('ClaimEvidenceMap', () => {
  it('says plainly when a claim has no source, instead of leaving the user to guess', () => {
    setup();
    expect(screen.getByText(/No source backs this claim yet/)).toBeInTheDocument();
  });

  it('links a source with a BUTTON, without requiring a drag', () => {
    const { onLink } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Link to…' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'The proposed model cuts translation errors by 20%' }),
    );
    expect(onLink).toHaveBeenCalledWith('c-1', 's-1');
  });

  it('detaches a link with a clearly named button', () => {
    const { onUnlink } = setup({ claims: [claim({ card_sources: [linked()] })] });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Detach source Neural machine translation with attention from this claim',
      }),
    );
    expect(onUnlink).toHaveBeenCalledWith('cs-1');
  });

  it('deletes a card with a clearly named button', () => {
    const { onDeleteCard } = setup();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete card The proposed model cuts translation errors by 20%',
      }),
    );
    expect(onDeleteCard).toHaveBeenCalledWith('c-1');
  });

  it('counts the sources in use correctly', () => {
    setup({
      claims: [claim({ card_sources: [linked()] })],
      sources: [source(), source({ id: 's-2', title: 'A source nobody uses' })],
    });
    expect(screen.getByText('1/2 in use')).toBeInTheDocument();
  });

  it('shows each link verification label as text, never hidden behind hover', () => {
    setup({
      claims: [claim({ card_sources: [linked({ support_label: 'UNSUPPORTED' })] })],
    });
    const section = screen.getByLabelText(
      'Claim The proposed model cuts translation errors by 20%',
    );
    // The label stays as the verifier produced it; the FE never rewrites it (CLAUDE.md §6).
    expect(within(section).getByText('UNSUPPORTED')).toBeInTheDocument();
  });

  it('points at the claim-generation step when there are no claims, not an empty map', () => {
    setup({ claims: [] });
    expect(screen.getByText(/No claims yet/)).toBeInTheDocument();
  });

  it('points at the source-search step when there are no sources', () => {
    setup({ sources: [] });
    expect(screen.getByText(/No sources yet/)).toBeInTheDocument();
  });

  it('disables every write button while a command is in flight, avoiding double clicks', () => {
    setup({ claims: [claim({ card_sources: [linked()] })], busy: true });
    expect(
      screen.getByRole('button', {
        name: 'Delete card The proposed model cuts translation errors by 20%',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Detach source Neural machine translation with attention from this claim',
      }),
    ).toBeDisabled();
  });
});
