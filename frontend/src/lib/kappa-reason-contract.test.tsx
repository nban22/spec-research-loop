import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A guard against CONTRACT DRIFT between the two packages.
 *
 * `KappaReason` on the frontend is a **hand copy** of the backend type — there is no shared type,
 * so TypeScript cannot tell when the two have drifted. This class of bug has bitten **three times**
 * inside the same feature:
 *
 * 1. `degenerate` was renamed on the backend while the frontend still compared the old name ⇒ the
 *    degenerate-κ explanation never appeared in the product.
 * 2. `MIN_UNION` was re-declared by hand on the frontend, with nothing forcing the two to match.
 * 3. `MALFORMED_COUNTS` was missing ⇒ a data error rendered as "No cards to measure yet".
 *
 * This test reads the backend source directly. Crude, but it is the **cheapest** thing that detects
 * the drift: the real fix is a shared type package, and that is outside #9's scope.
 */
function unionFrom(source: string, typeName: string): string[] {
  const m = new RegExp(`export type ${typeName} =([\\s\\S]*?);`).exec(source);
  if (!m) throw new Error(`type ${typeName} not found`);
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort();
}

describe('the KappaReason contract between backend and frontend', () => {
  it('both sides declare EXACTLY the same set of reasons', () => {
    const be = readFileSync(
      join(__dirname, '../../../backend/src/judge/agreement/agreement.ts'),
      'utf8',
    );
    const fe = readFileSync(join(__dirname, 'use-judge-agreement.ts'), 'utf8');

    const backend = unionFrom(be, 'KappaReason');
    const frontend = unionFrom(fe, 'KappaReason');

    expect(backend.length).toBeGreaterThan(0);
    // The failure message names the drifting values, so the next fix needs no hunting.
    expect(frontend, `backend has: ${backend.join(', ')}`).toEqual(backend);
  });
});
