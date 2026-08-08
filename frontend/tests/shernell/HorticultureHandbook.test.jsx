import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import http from '../../src/http';
import HorticultureHandbook from '../../src/pages/HorticultureHandbook';

vi.mock('../../src/http', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const PLANTS = [
  {
    id: 1,
    species: 'ficus benjamina',
    common_name: 'Weeping Fig',
    health_status: 'healthy',
    plant_family: 'moraceae',
  },
  {
    id: 2,
    species: 'bougainvillea',
    common_name: 'Paper Flower',
    health_status: 'critical',
    plant_family: 'nyctaginaceae',
  },
  {
    id: 3,
    species: 'mystery plant',
    common_name: null,
    health_status: 'at_risk',
    plant_family: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <HorticultureHandbook />
    </MemoryRouter>
  );
}

describe('HorticultureHandbook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    http.get.mockResolvedValue({ data: [] });
  });

  it('renders plants grouped by plant_family, with family headings shown', async () => {
    http.get.mockResolvedValue({ data: PLANTS });

    renderPage();

    // The family name also appears inside each card's "Family: <name>" line,
    // so scope these to the heading span to avoid ambiguous matches.
    expect(await screen.findByText('moraceae', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('nyctaginaceae', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Uncategorized', { selector: 'span' })).toBeInTheDocument();

    expect(screen.getByText('Ficus Benjamina')).toBeInTheDocument();
    expect(screen.getByText('Bougainvillea')).toBeInTheDocument();
    expect(screen.getByText('Mystery Plant')).toBeInTheDocument();

    expect(http.get).toHaveBeenCalledWith('/api/flora', {
      params: { include_catalog: 'true' },
    });
  });

  it('re-fetches with the filter query params after the debounce delay', async () => {
    http.get.mockResolvedValue({ data: PLANTS });

    renderPage();
    await screen.findByText('Ficus Benjamina');

    fireEvent.change(screen.getByLabelText('Plant Family'), {
      target: { value: 'rosaceae' },
    });
    fireEvent.change(screen.getByLabelText('Site Suitability'), {
      target: { value: 'full sun' },
    });
    fireEvent.change(screen.getByLabelText('Color'), {
      target: { value: 'pink' },
    });

    // Each filter is debounced 400ms independently, so give the assertion
    // room to wait past that before it's considered failed.
    await waitFor(
      () =>
        expect(http.get).toHaveBeenCalledWith('/api/flora', {
          params: {
            plant_family: 'rosaceae',
            site_suitability: 'full sun',
            color: 'pink',
            include_catalog: 'true',
          },
        }),
      { timeout: 2000 }
    );
  });

  it('shows the empty state when no plants match filters', async () => {
    http.get.mockResolvedValue({ data: [] });

    renderPage();
    await screen.findByText('No plants in the catalog yet');

    fireEvent.change(screen.getByLabelText('Plant Family'), {
      target: { value: 'nonexistent' },
    });

    expect(await screen.findByText('No plants match these filters')).toBeInTheDocument();
  });

  it('submits a question to the Ask the Handbook box and displays the answer', async () => {
    http.post.mockResolvedValue({
      data: { answer: 'Water twice a week.', referencedPlants: [] },
    });

    renderPage();
    await screen.findByText('No plants in the catalog yet');

    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'How often should I water ficus?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('Water twice a week.')).toBeInTheDocument();
    expect(http.post).toHaveBeenCalledWith('/api/flora/query', {
      question: 'How often should I water ficus?',
    });
  });

  it('submits a condition to Planting Suggestions and displays recommendations', async () => {
    http.post.mockResolvedValue({
      data: {
        recommendations: [
          { species: 'bougainvillea', tradeoff: 'Needs full sun.' },
        ],
        notes: 'Consider spacing plants 1m apart.',
      },
    });

    renderPage();
    await screen.findByText('No plants in the catalog yet');

    fireEvent.change(screen.getByLabelText('Site condition'), {
      target: { value: 'shaded car park' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    expect(await screen.findByText('Bougainvillea')).toBeInTheDocument();
    expect(screen.getByText('Needs full sun.')).toBeInTheDocument();
    expect(screen.getByText('Consider spacing plants 1m apart.')).toBeInTheDocument();
    expect(http.post).toHaveBeenCalledWith('/api/flora/planting-suggestions', {
      condition: 'shaded car park',
    });
  });
});
