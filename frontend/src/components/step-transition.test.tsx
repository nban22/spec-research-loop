import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepTransition } from './step-transition';

/**
 * Two things worth locking down — both **contracts**, not animation details:
 *
 * 1. The step content must **always** reach the screen. A broken animation is at worst ugly;
 *    swallowing the content is a blank page.
 * 2. This region must be `aria-live` — a screen reader needs to know the content was **replaced**,
 *    not that the user navigated to a new page.
 *
 * Deliberately **not** testing the `x` value, the duration or the spring type: those will be tuned
 * repeatedly, and locking them down only creates tests that break whenever the motion feel changes.
 */
describe('StepTransition', () => {
  it('renders the content of the current step', () => {
    render(
      <StepTransition step={1}>
        <p>Step 1 content</p>
      </StepTransition>,
    );
    expect(screen.getByText('Step 1 content')).toBeInTheDocument();
  });

  it('reaches the screen with the new content after a step change', async () => {
    const { rerender } = render(
      <StepTransition step={1}>
        <p>Step 1 content</p>
      </StepTransition>,
    );
    rerender(
      <StepTransition step={2}>
        <p>Step 2 content</p>
      </StepTransition>,
    );
    // `findBy`, not `getBy`: `mode="wait"` keeps the old step alive until its exit animation
    // finishes — which is exactly what removes the white flash between steps.
    expect(await screen.findByText('Step 2 content')).toBeInTheDocument();
  });

  it('renders the content when going back a step too', async () => {
    const { rerender } = render(
      <StepTransition step={3}>
        <p>Step 3 content</p>
      </StepTransition>,
    );
    rerender(
      <StepTransition step={2}>
        <p>Step 2 content</p>
      </StepTransition>,
    );
    expect(await screen.findByText('Step 2 content')).toBeInTheDocument();
  });

  it('marks the content region aria-live so screen readers know it was replaced', () => {
    render(
      <StepTransition step={1}>
        <p>Step 1 content</p>
      </StepTransition>,
    );
    expect(screen.getByText('Step 1 content').parentElement).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});
