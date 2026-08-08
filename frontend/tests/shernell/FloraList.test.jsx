import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import http from '../../src/http';
import FloraList from '../../src/pages/FloraList';

vi.mock('../../src/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const PLANTS = [
  {
    id: 1,
    species: 'ficus benjamina',
    common_name: 'Weeping Fig',
    health_status: 'healthy',
    location_zone: 'Block A',
    plant_family: 'moraceae',
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 2,
    species: 'bougainvillea',
    common_name: 'Paper Flower',
    health_status: 'critical',
    location_zone: 'Block B',
    plant_family: 'nyctaginaceae',
    createdAt: '2026-08-02T10:00:00.000Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <FloraList />
    </MemoryRouter>
  );
}

async function selectHealthFilter(label) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Health Status' }));
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

describe('FloraList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a card per plant from the API response', async () => {
    http.get.mockResolvedValue({ data: PLANTS });

    renderPage();

    expect(await screen.findByText('Ficus Benjamina')).toBeInTheDocument();
    expect(screen.getByText('Bougainvillea')).toBeInTheDocument();

    // "Healthy"/"Critical" also appear in the metrics breakdown panel, so
    // scope the chip assertion to each plant's own card.
    const healthyCard = screen.getByText('Ficus Benjamina').closest('.MuiCard-root');
    expect(within(healthyCard).getByText('Healthy')).toBeInTheDocument();
    const criticalCard = screen.getByText('Bougainvillea').closest('.MuiCard-root');
    expect(within(criticalCard).getByText('Critical')).toBeInTheDocument();

    expect(http.get).toHaveBeenCalledWith('/api/flora', { params: {} });
  });

  it('re-fetches with the health_status query param when the filter changes', async () => {
    http.get.mockResolvedValue({ data: PLANTS });

    renderPage();
    await screen.findByText('Ficus Benjamina');

    await selectHealthFilter('Critical');

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/api/flora', {
        params: { health_status: 'critical' },
      })
    );
  });

  it('filters the currently-loaded list client-side without an extra API call', async () => {
    http.get.mockResolvedValue({ data: PLANTS });

    renderPage();
    await screen.findByText('Ficus Benjamina');
    expect(http.get).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText('Search by species or name'), {
      target: { value: 'bougainvillea' },
    });

    expect(await screen.findByText('Bougainvillea')).toBeInTheDocument();
    expect(screen.queryByText('Ficus Benjamina')).not.toBeInTheDocument();
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no plants', async () => {
    http.get.mockResolvedValue({ data: [] });

    renderPage();

    expect(await screen.findByText('No plants recorded yet')).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    http.get.mockRejectedValue(new Error('network down'));

    renderPage();

    expect(
      await screen.findByText('Failed to load flora. Please try again.')
    ).toBeInTheDocument();
  });
});
