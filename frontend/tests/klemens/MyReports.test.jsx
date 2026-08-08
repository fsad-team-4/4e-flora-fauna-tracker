import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import http from '../../src/http';
import MyReports from '../../src/pages/MyReports';

vi.mock('../../src/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const REPORTS = [
  {
    id: 1,
    title: 'Fallen branch at void deck',
    category: 'flora_health',
    status: 'open',
    block_number: 'Blk 123',
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 2,
    title: 'Cat stuck on ledge',
    category: 'community_cat',
    status: 'resolved',
    block_number: null,
    createdAt: '2026-08-02T10:00:00.000Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <MyReports />
    </MemoryRouter>
  );
}

describe('MyReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a card per report from the API response', async () => {
    http.get.mockResolvedValue({ data: REPORTS });

    renderPage();

    expect(await screen.findByText('Fallen branch at void deck')).toBeInTheDocument();
    expect(screen.getByText('Cat stuck on ledge')).toBeInTheDocument();
    expect(http.get).toHaveBeenCalledWith('/api/reports');
  });

  it('maps category and status codes to their display labels', async () => {
    http.get.mockResolvedValue({ data: REPORTS });

    renderPage();

    expect(await screen.findByText('Flora Health')).toBeInTheDocument();
    expect(screen.getByText('Community Cat')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('resolved')).toBeInTheDocument();
  });

  it('shows the block number only when the report has one', async () => {
    http.get.mockResolvedValue({ data: REPORTS });

    renderPage();

    expect(await screen.findByText('Blk 123')).toBeInTheDocument();
    // the second report has no block number, so only one is rendered
    expect(screen.getAllByText(/^Blk /)).toHaveLength(1);
  });

  it('shows the empty state when there are no reports', async () => {
    http.get.mockResolvedValue({ data: [] });

    renderPage();

    expect(await screen.findByText(/No reports yet/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Submit your first report' })
    ).toBeInTheDocument();
  });

  it('shows an error alert when the request fails', async () => {
    http.get.mockRejectedValue(new Error('network down'));

    renderPage();

    expect(await screen.findByText('Failed to load reports')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/No reports yet/)).not.toBeInTheDocument()
    );
  });
});
