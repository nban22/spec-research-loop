import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` is hoisted to the top of the file, so its factory cannot read a `const` declared in the
// body. `vi.hoisted` is the only place to declare a variable the factory can see.
const { get, replace } = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, get } };
});

import AuthLayout from './layout';

/**
 * The **outbound** direction of route protection (#25). Three behaviours worth testing, and all
 * three have broken or nearly broken: bouncing a signed-in visitor out, leaving the form in place
 * for a signed-out one, and **not flashing the form** while waiting — the last is why this layout
 * exists instead of a bare `useEffect`.
 */
function renderLayout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AuthLayout>
    <form data-testid="auth-form">sign-in form</form>
  </AuthLayout>, { wrapper });
}

describe('(auth)/layout — blocking already signed-in visitors', () => {
  beforeEach(() => {
    replace.mockClear();
    get.mockReset();
  });

  it('with a session ⇒ redirects to / and never renders the form', async () => {
    get.mockResolvedValue({ user: { id: 'u1' } });
    renderLayout();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument();
  });

  it('signed out ⇒ renders the form and does NOT redirect', async () => {
    get.mockRejectedValue(new Error('401'));
    renderLayout();

    await waitFor(() =>
      expect(screen.getByTestId('auth-form')).toBeInTheDocument(),
    );
    // No redirect loop — the acceptance criterion of #25.
    expect(replace).not.toHaveBeenCalled();
  });

  it('while /auth/me is pending ⇒ never flashes the form, not even for one frame', () => {
    // A promise that never resolves: pins the component in its loading state.
    get.mockReturnValue(new Promise(() => {}));
    renderLayout();

    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
