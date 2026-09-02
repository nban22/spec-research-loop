import { Panel } from '@/components/panel';
import { BookOpen, ShieldCheck, Scale, GitBranch } from 'lucide-react';

/**
 * A single static screen. It appears in the mockup's nav but is **not** one of the 16 required
 * features (ARCHITECTURE §3, DESIGN_SYSTEM §9) — so it stays one screen and does not grow.
 */
export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-3 py-4 md:px-4">
      <h1 className="text-ink-1 text-xl font-semibold">Help</h1>

      <Panel accent="brand" icon={BookOpen} title="What the system does">
        <p className="text-ink-2 text-sm leading-relaxed">
          You enter a research idea that is still vague. The system paraphrases it back so you can
          confirm it understood you, decomposes it into cards, searches for real literature,
          extracts a research gap, builds an experiment plan, then puts it through 5 independent
          judges. The result is a 14-section research specification, exportable as PDF and Markdown.
        </p>
      </Panel>

      <Panel accent="ok" icon={ShieldCheck} title="Why every citation carries a label">
        <p className="text-ink-2 text-sm leading-relaxed">
          Every source comes from Semantic Scholar or OpenAlex — the system is{' '}
          <strong>never allowed to invent a paper</strong>. For each (claim, source) pair, the
          evidence verifier checks the real abstract and assigns SUPPORTED / WEAK / UNSUPPORTED.
          While an UNSUPPORTED label remains on a claim, gap or contribution, publishing stays
          blocked — that is by design, not a bug.
        </p>
      </Panel>

      <Panel accent="decide" icon={Scale} title="You always make the call">
        <p className="text-ink-2 text-sm leading-relaxed">
          No step confirms itself. Every change passes through a choice you make, and every question
          offers an <strong>“Other — I will describe it myself”</strong> option. Each choice is
          recorded with its timestamp and reason, and appears in section 14 of the specification.
        </p>
      </Panel>

      <Panel accent="neutral" icon={GitBranch} title="Versions and history">
        <p className="text-ink-2 text-sm leading-relaxed">
          Each time you apply a decision the system creates a new version instead of overwriting —
          so you can compare any two versions and always see what changed. Each project runs at most
          3 judge rounds.
        </p>
      </Panel>
    </div>
  );
}
