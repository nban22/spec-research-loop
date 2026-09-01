import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchFlowAnimation } from './research-flow';

/**
 * Four contracts, no frame-by-frame testing:
 *
 * 1. **It plays but can be paused** — an animation that cannot be stopped is an advert.
 * 2. **Real buttons jump straight to a stage**, and a manual pick stops autoplay — otherwise the
 *    stage you just chose jumps away two seconds later.
 * 3. **Every stage has descriptive text**, not just a picture. A picture alone cannot be read by a
 *    screen reader.
 * 4. The current stage is marked with `aria-current`.
 */
describe('ResearchFlowAnimation', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('opens on the first stage and is already playing', () => {
    render(<ResearchFlowAnimation />);
    expect(screen.getByText('A still-vague idea')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause the walkthrough' })).toBeInTheDocument();
  });

  it('advances to the next stage after one beat', async () => {
    render(<ResearchFlowAnimation />);
    await vi.advanceTimersByTimeAsync(3500);
    expect(await screen.findByText('Decomposed into cards')).toBeInTheDocument();
  });

  it('stays put after Pause is pressed', async () => {
    render(<ResearchFlowAnimation />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause the walkthrough' }));
    await vi.advanceTimersByTimeAsync(12_000);
    expect(screen.getByText('A still-vague idea')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play the walkthrough' })).toBeInTheDocument();
  });

  it('jumps straight to a stage by button, and that stops autoplay', async () => {
    render(<ResearchFlowAnimation />);
    fireEvent.click(screen.getByRole('button', { name: 'Stage 5: Five judges push back' }));

    expect(await screen.findByText('Five judges push back')).toBeInTheDocument();
    // Without stopping, 3.4 seconds later it would jump to stage 6 and the reader loses their place.
    await vi.advanceTimersByTimeAsync(8000);
    expect(screen.getByText('Five judges push back')).toBeInTheDocument();
  });

  it('marks the current stage with aria-current', () => {
    render(<ResearchFlowAnimation />);
    expect(
      screen.getByRole('button', { name: 'Stage 1: A still-vague idea' }),
    ).toHaveAttribute('aria-current', 'step');
    expect(
      screen.getByRole('button', { name: 'Stage 2: Decomposed into cards' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('gives every stage descriptive text, not just a picture', async () => {
    render(<ResearchFlowAnimation />);
    fireEvent.click(screen.getByRole('button', { name: 'Stage 6: The 14-section specification' }));
    expect(await screen.findByText(/publishing is blocked/)).toBeInTheDocument();
  });

  it('has six stages, matching the five steps of the process', () => {
    render(<ResearchFlowAnimation />);
    expect(screen.getAllByRole('button', { name: /^Stage \d/ })).toHaveLength(6);
  });
});
