'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';

/**
 * A **directional** step transition: going forward, the content slides in from the right; going
 * back, from the left.
 *
 * This used to be a CSS keyframe. It moved to `motion` because a keyframe has **no exit**: the old
 * step vanished instantly and only then did the new one slide in, so the eye caught a white flash
 * between steps. `AnimatePresence mode="wait"` keeps the old step alive long enough to slide out
 * first — that is the entire difference between "animated" and "smooth".
 *
 * Still **not** the View Transitions API: Next 16 has not promoted `viewTransition` to stable config.
 *
 * The direction is derived with React's **"adjust state when a prop changes"** pattern rather than
 * `useRef`: reading or writing `ref.current` during render is what `react-hooks/refs` forbids, and
 * rightly so — refs do not take part in render, so React does not promise the value read is current.
 */
export function StepTransition({ step, children }: { step: number; children: ReactNode }) {
  const [prevStep, setPrevStep] = useState(step);
  const [forward, setForward] = useState(true);
  const reduced = useReducedMotion();

  if (prevStep !== step) {
    setForward(step >= prevStep);
    setPrevStep(step);
  }

  // For someone who turned motion off, changing step must be **instant**, not merely slower.
  const offset = reduced ? 0 : forward ? 28 : -28;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={{ opacity: 0, x: offset }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -offset }}
        transition={
          reduced
            ? { duration: 0 }
            : // A spring rather than a fixed easing: when the user taps two steps in quick
              // succession, the spring inherits the current velocity and reverses smoothly,
              // whereas an easing snaps back to the start.
              { type: 'spring', stiffness: 420, damping: 38, mass: 0.7 }
        }
        /* Screen readers must learn that this region was replaced, not that a new page loaded. */
        aria-live="polite"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
