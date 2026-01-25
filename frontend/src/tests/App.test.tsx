import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

const queryClient = new QueryClient();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>{children}</BrowserRouter>
  </QueryClientProvider>
);

describe('Button Component', () => {
  it('renders correctly', () => {
    render(<Button>Click me</Button>, { wrapper });
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<Button loading>Submit</Button>, { wrapper });
    expect(screen.getByText('Submit')).toBeInTheDocument();
  });

  it('is disabled when loading', () => {
    render(<Button loading>Submit</Button>, { wrapper });
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('Input Component', () => {
  it('renders with label', () => {
    render(<Input label="Email" />, { wrapper });
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Input label="Email" error="Invalid email" />, { wrapper });
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
  });
});

describe('Card Component', () => {
  it('renders children', () => {
    render(
      <Card>
        <CardContent>Card content</CardContent>
      </Card>,
      { wrapper }
    );
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });
});

describe('StatusBadge Component', () => {
  it('renders draft status', () => {
    render(<StatusBadge status="DRAFT" />, { wrapper });
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders complete status', () => {
    render(<StatusBadge status="PARTICIPANT_COMPLETE" />, { wrapper });
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders approved status', () => {
    render(<StatusBadge status="ADMIN_APPROVED" />, { wrapper });
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders paid status', () => {
    render(<StatusBadge status="PAID" />, { wrapper });
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });
});
