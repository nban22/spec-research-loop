'use client';

import { Pause, Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * **The research-flow animation** — Step 1 of the brief, the *encourage creativity* section:
 * *"Diagram · concept map · component list · animation of the research flow"*.
 *
 * The question it answers in 20 seconds: **how a vague idea becomes a sourced specification.** The
 * home page used to answer that with two sentences; a first-time reader still had no idea how many
 * steps there were or what each one did.
 *
 * ## Three decisions
 *
 * 1. **It plays itself, but can be stopped and scrubbed.** An animation that plays and cannot be
 *    stopped is an advert; one that waits for a click never gets clicked. So there is a real pause
 *    button and six buttons that jump straight to a stage.
 * 2. **Each stage draws what that stage actually produces** — cards, source dots, links, judge
 *    badges — not six rectangles changing colour. The picture has to carry information, otherwise a
 *    bullet list would do the job and cost less.
 * 3. **With `prefers-reduced-motion` it does NOT autoplay.** Automatic motion is the most hostile
 *    thing for a vestibular-sensitive reader. It then becomes a static diagram, scrubbed by button.
 */

type Stage = {
  key: string;
  step: string;
  title: string;
  detail: string;
  /** What to draw in the right-hand frame — one figure per stage. */
  art: 'idea' | 'cards' | 'sources' | 'links' | 'judges' | 'spec';
};

const STAGES: Stage[] = [
  {
    key: 'idea',
    step: 'S1',
    title: 'A still-vague idea',
    detail: 'You write one sentence. The system paraphrases it back and asks: did I get this right?',
    art: 'idea',
  },
  {
    key: 'cards',
    step: 'S1',
    title: 'Decomposed into cards',
    detail: 'Problem · research question · gap · contribution · claim · evidence — one card each, one status each.',
    art: 'cards',
  },
  {
    key: 'sources',
    step: 'S2',
    title: 'Searching for real literature',
    detail: 'Sources come from Semantic Scholar and OpenAlex, with DOIs checked. The model is never asked to recall papers.',
    art: 'sources',
  },
  {
    key: 'links',
    step: 'S3',
    title: 'Linking claims to evidence',
    detail: 'Every statement must point to a sentence in a paper that backs it. A claim that cannot be linked is a dangling claim.',
    art: 'links',
  },
  {
    key: 'judges',
    step: 'S4',
    title: 'Five judges push back',
    detail: 'Five disjoint remits, scored independently before any of them sees another judge. You decide what to change.',
    art: 'judges',
  },
  {
    key: 'spec',
    step: 'S5',
    title: 'The 14-section specification',
    detail: 'While any claim lacks a source, publishing is blocked. Not a warning — an actual block.',
    art: 'spec',
  },
];

/** The autoplay tempo. 3.4 seconds is enough to read one description line without getting impatient. */
const DWELL_MS = 3400;

export function ResearchFlowAnimation() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  // Someone who turned motion off gets NO autoplay by default — see decision 3 at the top of the file.
  const [playing, setPlaying] = useState(!reduced);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setActive((i) => (i + 1) % STAGES.length), DWELL_MS);
    return () => clearInterval(t);
  }, [playing]);

  const stage = STAGES[active];

  /** A manual pick stops autoplay — otherwise the stage you just chose jumps away two seconds later. */
  const pick = (i: number) => {
    setActive(i);
    setPlaying(false);
  };

  return (
    <section
      aria-label="The research flow across five steps"
      className="border-hairline bg-surface space-y-3 rounded-lg border px-3 py-3 md:px-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-ink-1 text-sm font-medium">What one working loop looks like</h2>
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? 'Pause the walkthrough' : 'Play the walkthrough'}
          className="border-hairline text-ink-3 hover:text-brand-strong ease-out-quart flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors duration-150"
        >
          {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <StageRail active={active} onPick={pick} />

      <div className="grid gap-3 md:grid-cols-[1fr_240px] md:items-center">
        <div className="min-h-24">
          {/* No `AnimatePresence` wrapper: an **exit** animation here is not worth what it costs —
              the new content could only mount after the old one finished, so screen readers and
              tests would both see a gap in between. Changing `key` swaps immediately, and the
              fade-in is the part the eye actually reads. */}
          <div>
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-1"
            >
              <p className="text-brand-strong text-2xs font-medium">
                {stage.step} · stage {active + 1}/{STAGES.length}
              </p>
              <p className="text-ink-1 text-sm font-medium">{stage.title}</p>
              <p className="text-ink-3 text-xs leading-relaxed">{stage.detail}</p>
            </motion.div>
          </div>
        </div>

        <StageArt art={stage.art} reduced={!!reduced} />
      </div>
    </section>
  );
}

/**
 * The six-stage rail. These are **real buttons**, not decorative dots — the user jumps straight to
 * the stage they want, and the keyboard can reach them (frontend/CLAUDE.md §7).
 */
function StageRail({ active, onPick }: { active: number; onPick: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const done = i < active;
        const on = i === active;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={on ? 'step' : undefined}
              aria-label={`Stage ${i + 1}: ${s.title}`}
              className={cn(
                'ease-out-quart h-1.5 flex-1 cursor-pointer rounded-full transition-colors duration-300',
                on ? 'bg-brand-ink' : done ? 'bg-brand-line' : 'bg-neutral-line',
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}

const ART_W = 240;
const ART_H = 132;

/** The figure for each stage. One drawing per `art` value — see decision 2 at the top of the file. */
function StageArt({ art, reduced }: { art: Stage['art']; reduced: boolean }) {
  const spring = reduced
    ? { duration: 0 }
    : ({ type: 'spring', stiffness: 300, damping: 26 } as const);

  return (
    <div className="border-hairline bg-canvas rounded-md border">
      <svg
        viewBox={`0 0 ${ART_W} ${ART_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Illustration of the ${art} stage`}
      >
        <motion.g
          key={art}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
            {art === 'idea' && (
              <>
                {/* The raw idea: a few faint strokes of text with no clear shape. */}
                {[0, 1, 2].map((i) => (
                  <motion.rect
                    key={i}
                    x={40}
                    y={44 + i * 16}
                    height={7}
                    rx={3.5}
                    className="fill-neutral-line"
                    initial={{ width: 0 }}
                    animate={{ width: [130, 160, 96][i] }}
                    transition={{ ...spring, delay: reduced ? 0 : i * 0.08 }}
                  />
                ))}
              </>
            )}

            {art === 'cards' && (
              <>
                {/* Six cards popping in order — exactly what the decomposition step produces. */}
                {Array.from({ length: 6 }, (_, i) => (
                  <motion.rect
                    key={i}
                    x={26 + (i % 3) * 66}
                    y={34 + Math.floor(i / 3) * 40}
                    width={56}
                    height={30}
                    rx={5}
                    className={cn(
                      i % 3 === 0 ? 'fill-ok-soft' : i % 3 === 1 ? 'fill-brand-soft' : 'fill-warn-soft',
                    )}
                    stroke="currentColor"
                    strokeWidth={0.6}
                    initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...spring, delay: reduced ? 0 : i * 0.06 }}
                    style={{ transformOrigin: `${54 + (i % 3) * 66}px ${49 + Math.floor(i / 3) * 40}px` }}
                  />
                ))}
              </>
            )}

            {art === 'sources' && (
              <>
                {Array.from({ length: 7 }, (_, i) => {
                  const cx = 34 + i * 28;
                  const cy = 46 + ((i * 37) % 48);
                  return (
                    <motion.circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={7 - (i % 3)}
                      className="fill-brand-ink"
                      initial={{ opacity: 0, scale: reduced ? 1 : 0.3 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ ...spring, delay: reduced ? 0 : i * 0.07 }}
                      style={{ transformOrigin: `${cx}px ${cy}px` }}
                    />
                  );
                })}
                <text x={ART_W / 2} y={116} textAnchor="middle" className="fill-ink-4 text-[9px]">
                  Semantic Scholar · OpenAlex · Crossref
                </text>
              </>
            )}

            {art === 'links' && (
              <>
                {/* Three claims on the left, three sources on the right. The links draw themselves in. */}
                {[0, 1, 2].map((i) => (
                  <rect
                    key={`c${i}`}
                    x={20}
                    y={30 + i * 30}
                    width={54}
                    height={20}
                    rx={4}
                    className="fill-brand-soft"
                  />
                ))}
                {[0, 1, 2].map((i) => (
                  <circle key={`s${i}`} cx={196} cy={40 + i * 30} r={7} className="fill-ok-ink" />
                ))}
                {[
                  [0, 0],
                  [1, 1],
                  [1, 2],
                ].map(([from, to], i) => (
                  <motion.line
                    key={i}
                    x1={74}
                    y1={40 + from * 30}
                    x2={189}
                    y2={40 + to * 30}
                    className="stroke-ok-ink"
                    strokeWidth={1.5}
                    initial={{ pathLength: reduced ? 1 : 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.15 + i * 0.18 }}
                  />
                ))}
                {/* The third claim cannot be linked — a dangling claim, painted as a warning. */}
                <motion.rect
                  x={20}
                  y={90}
                  width={54}
                  height={20}
                  rx={4}
                  className="fill-warn-soft stroke-warn-line"
                  strokeWidth={1.2}
                  strokeDasharray="3 2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.8 }}
                />
              </>
            )}

            {art === 'judges' && (
              <>
                {Array.from({ length: 5 }, (_, i) => (
                  <motion.g key={i}>
                    <motion.rect
                      x={16 + i * 44}
                      y={34}
                      width={36}
                      height={44}
                      rx={5}
                      className="fill-decide-soft stroke-decide-line"
                      strokeWidth={0.8}
                      initial={{ opacity: 0, y: reduced ? 34 : 20 }}
                      animate={{ opacity: 1, y: 34 }}
                      transition={{ ...spring, delay: reduced ? 0 : i * 0.08 }}
                    />
                    <text
                      x={34 + i * 44}
                      y={60}
                      textAnchor="middle"
                      className="fill-decide-strong text-[10px] font-medium"
                    >
                      J{i + 1}
                    </text>
                  </motion.g>
                ))}
                <motion.text
                  x={ART_W / 2}
                  y={100}
                  textAnchor="middle"
                  className="fill-ink-4 text-[9px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.5 }}
                >
                  scored independently, blind to each other
                </motion.text>
              </>
            )}

            {art === 'spec' && (
              <>
                <motion.rect
                  x={78}
                  y={20}
                  width={84}
                  height={100}
                  rx={6}
                  className="fill-surface stroke-ok-line"
                  strokeWidth={1.4}
                  initial={{ opacity: 0, scale: reduced ? 1 : 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={spring}
                  style={{ transformOrigin: '120px 70px' }}
                />
                {Array.from({ length: 7 }, (_, i) => (
                  <motion.rect
                    key={i}
                    x={88}
                    y={32 + i * 12}
                    height={4}
                    rx={2}
                    className={i === 6 ? 'fill-ok-ink' : 'fill-neutral-line'}
                    initial={{ width: 0 }}
                    animate={{ width: i === 6 ? 40 : 64 }}
                    transition={{ duration: reduced ? 0 : 0.28, delay: reduced ? 0 : 0.1 + i * 0.05 }}
                  />
                ))}
              </>
            )}
        </motion.g>
      </svg>
    </div>
  );
}
