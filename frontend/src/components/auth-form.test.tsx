import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthForm } from './auth-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('AuthForm', () => {
  it('renders login form inputs with proper HTML attributes', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthForm mode="login" />
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText('Email');
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('autoComplete', 'email');

    const passwordInput = screen.getByLabelText('Mật khẩu');
    expect(passwordInput).toHaveAttribute('type', 'password');

    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('shows client-side registration validation before calling the API', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthForm mode="register" />
      </QueryClientProvider>,
    );

    const nameInput = screen.getByLabelText('Tên hiển thị');
    expect(nameInput).toHaveAttribute('id', 'display_name');

    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(await screen.findByText('Email không hợp lệ')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu tối thiểu 8 ký tự')).toBeInTheDocument();
  });
});
