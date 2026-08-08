import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../../src/components/ProtectedRoute';
import { UserProvider } from '../../src/contexts/UserContext';

// The real UserProvider reads the JWT out of localStorage on mount, so seeding a
// token is enough to log a user in - no need to mock the context.
function makeToken({ user_id = 1, role = 'resident', name = 'Test User' } = {}) {
  const payload = btoa(JSON.stringify({ user_id, role, name }));
  return `header.${payload}.signature`;
}

function renderGuardedRoute(roles) {
  return render(
    <UserProvider>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/" element={<p>Home page</p>} />
          <Route path="/login" element={<p>Login page</p>} />
          <Route
            path="/secret"
            element={
              <ProtectedRoute roles={roles}>
                <p>Secret content</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </UserProvider>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects to /login when there is no user', () => {
    renderGuardedRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('redirects home when the user role is not in the roles prop', () => {
    localStorage.setItem('accessToken', makeToken({ role: 'resident' }));

    renderGuardedRoute(['field_officer', 'manager']);

    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('renders children when the user role is in the roles prop', () => {
    localStorage.setItem('accessToken', makeToken({ role: 'manager' }));

    renderGuardedRoute(['field_officer', 'manager']);

    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });

  it('renders children for any logged-in user when no roles prop is given', () => {
    localStorage.setItem('accessToken', makeToken({ role: 'resident' }));

    renderGuardedRoute();

    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });

  it('treats an expired token as logged out', () => {
    const expired = btoa(
      JSON.stringify({ user_id: 1, role: 'resident', name: 'Test User', exp: 1 })
    );
    localStorage.setItem('accessToken', `header.${expired}.signature`);

    renderGuardedRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});
