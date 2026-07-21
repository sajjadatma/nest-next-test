import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { DashboardClient } from './dashboard-client';
import { server } from '@/test/server';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@porsche-design-system/components-react/ssr', () => ({
  PButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  PWordmark: () => <span>Drive</span>,
}));

const account = { id: 'user-1', email: 'jane@example.com', name: 'Jane', roles: ['user'], permissions: ['dashboard:read'] };
const overview = { metrics: [{ label: 'Registered users', value: 1 }], recentUsers: [] };

describe('DashboardClient', () => {
  beforeEach(() => {
    replace.mockClear();
    localStorage.setItem('drive-access-token', 'token-1');
    server.use(
      http.get('http://localhost:5050/api/auth/me', () => HttpResponse.json(account)),
      http.get('http://localhost:5050/api/dashboard', () => HttpResponse.json(overview)),
    );
  });

  it('shows loading state then saves profile changes', async () => {
    const user = userEvent.setup();
    server.use(http.patch('http://localhost:5050/api/auth/me', () => HttpResponse.json({ ...account, name: 'Jane Updated' })));
    render(<DashboardClient />);
    expect(screen.getByText('Loading workspace…')).toBeInTheDocument();
    await screen.findByText('Drive workspace');

    await user.click(screen.getByRole('button', { name: 'My account' }));
    const name = screen.getByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'Jane Updated');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated.');
  });

  it('shows an error when the profile request fails', async () => {
    server.use(http.patch('http://localhost:5050/api/auth/me', () => HttpResponse.json({ message: 'Could not save profile' }, { status: 500 })));
    render(<DashboardClient />);
    await screen.findByText('Drive workspace');
    fireEvent.click(screen.getByRole('button', { name: 'My account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save profile');
  });
});
