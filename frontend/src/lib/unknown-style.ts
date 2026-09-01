import { CircleHelp } from 'lucide-react';
import type { StatusStyle } from './status-style';

/**
 * The escape hatch for when a label lookup table **does not hold the key we need**.
 *
 * `Record<Enum, StatusStyle>` makes TypeScript believe every key exists — but the enum values
 * here come from **the API at runtime**, not from the compiler. If the backend adds a seventh
 * status, or a mock/fixture writes a wrong value, the lookup returns `undefined` and
 * `style.icon` **blanks the whole page**.
 *
 * It lives in its own file rather than inside `status-style.ts`: that file is the **single
 * source of truth about colour** (DESIGN_SYSTEM §7.1) and the only place allowed to hold raw
 * colour classes. What lives here is not a colour of the system, it is the behaviour when the
 * system does not know a value.
 *
 * Principle: **show the unknown value verbatim**, do not swallow it into "Unknown". The user
 * sees that something does not line up, and the developer immediately reads which value caused
 * it. Swallowing it turns a loud bug into a silent one.
 */
export function styleOr(
  table: Record<string, StatusStyle | undefined>,
  key: string,
): StatusStyle {
  return (
    table[key] ?? {
      label: key,
      icon: CircleHelp,
      className: 'bg-neutral-soft text-neutral-strong border-neutral-line',
    }
  );
}
