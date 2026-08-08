import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import http from '../../src/http';
import FloraDetail from '../../src/pages/FloraDetail';

vi.mock('../../src/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const PLANT = {
  id: 1,
  species: 'ficus benjamina',
  common_name: 'Weeping Fig',
  health_status: 'healthy',
  location: 'Tampines',
  location_zone: 'Block A',
  health_notes: 'Doing well',
  plant_family: 'moraceae',
  site_suitability: 'full sun',
  color: 'green',
  max_height_at_maturity: 5,
  image_url: 'https://example.com/photo.jpg',
  last_inspected_at: '2026-07-01T10:00:00.000Z',
  care_recommendation: null,
  recorder: { name: 'Alice Tan' },
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
};

function mockGetForPlant(plant) {
  http.get.mockImplementation((url) => {
    if (url === '/api/flora/species-catalog') return Promise.resolve({ data: [] });
    if (url === '/api/flora') return Promise.resolve({ data: [plant] });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function renderPage(id = '1') {
  return render(
    <MemoryRouter initialEntries={[`/flora/${id}`]}>
      <Routes>
        <Route path="/flora/:id" element={<FloraDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FloraDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the plant's details from the GET /api/flora response", async () => {
    mockGetForPlant(PLANT);

    renderPage();

    expect(await screen.findByText('Ficus Benjamina')).toBeInTheDocument();
    expect(screen.getByText('Weeping Fig')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Tampines')).toBeInTheDocument();
    expect(screen.getByText('Block A')).toBeInTheDocument();
    expect(screen.getByText('Doing well')).toBeInTheDocument();
    expect(screen.getByText('moraceae')).toBeInTheDocument();
    expect(screen.getByText('full sun')).toBeInTheDocument();
    expect(screen.getByText('green')).toBeInTheDocument();
    expect(screen.getByText('5 m')).toBeInTheDocument();
  });

  it('shows the photo when image_url is set', async () => {
    mockGetForPlant(PLANT);

    renderPage();

    const img = await screen.findByRole('img', { name: PLANT.species });
    expect(img).toHaveAttribute('src', PLANT.image_url);
  });

  it('does not render an image element when image_url is null', async () => {
    mockGetForPlant({ ...PLANT, image_url: null });

    renderPage();

    await screen.findByText('Ficus Benjamina');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('gets and displays an AI care recommendation', async () => {
    mockGetForPlant(PLANT);
    http.post.mockResolvedValue({
      data: { ...PLANT, care_recommendation: '🌱 Water twice a week' },
    });

    renderPage();
    await screen.findByText('Ficus Benjamina');

    fireEvent.click(screen.getByRole('button', { name: 'Get AI Recommendation' }));

    expect(await screen.findByText('🌱 Water twice a week')).toBeInTheDocument();
    expect(http.post).toHaveBeenCalledWith('/api/flora/1/care-recommendation');
  });

  it('shows a not-found message when no plant matches the id', async () => {
    mockGetForPlant(PLANT); // list only contains id 1

    renderPage('999');

    expect(await screen.findByText('Plant not found.')).toBeInTheDocument();
  });

  it('displays the Record Info section', async () => {
    mockGetForPlant(PLANT);

    renderPage();

    expect(await screen.findByText('Alice Tan')).toBeInTheDocument();
    expect(
      screen.getByText(new Date(PLANT.createdAt).toLocaleString())
    ).toBeInTheDocument();
    expect(
      screen.getByText(new Date(PLANT.updatedAt).toLocaleString())
    ).toBeInTheDocument();
  });
});
