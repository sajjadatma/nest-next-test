import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { AuthForm } from './auth-form';
import { server } from '@/test/server';
import { clear, token } from '@/lib/api';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@porsche-design-system/components-react/ssr', () => ({
  PButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  PWordmark: () => <span>Drive</span>,
}));

describe('AuthForm', () => {
  beforeEach(() => {
    replace.mockClear();
    clear();
    server.use(http.get('http://127.0.0.1:5050/api/auth/me', () => HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })));
  });

  it('submits registration and stores the received session', async () => {
    const user = userEvent.setup();
    server.use(http.post('http://127.0.0.1:5050/api/auth/register', async ({ request }) => {
      expect(await request.json()).toMatchObject({ email: 'jane@example.com', password: 'password123', name: 'Jane Smith' });
      return HttpResponse.json({ accessToken: 'token-1', user: { id: '1', email: 'jane@example.com', name: 'Jane Smith' } });
    }));
    render(<AuthForm mode="register" />);

    await user.type(screen.getByLabelText('Full name'), 'Jane Smith');
    await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(token()).toBe('token-1');
  });

  it('renders an API error without navigating away', async () => {
    server.use(http.post('http://127.0.0.1:5050/api/auth/login', () => HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 })));
    render(<AuthForm mode="login" />);
    await screen.findByLabelText('Email address');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects an authenticated visitor away from the login route', async () => {
    server.use(http.post('http://127.0.0.1:5050/api/auth/refresh', () => HttpResponse.json({ accessToken: 'token-1', user: { id: '1', email: 'jane@example.com' } })));
    server.use(http.get('http://127.0.0.1:5050/api/auth/me', () => HttpResponse.json({ id: '1', email: 'jane@example.com' })));
    render(<AuthForm mode="login" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });
});
