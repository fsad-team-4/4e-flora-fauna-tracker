import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import http from '../../src/http';
import AddFlora from '../../src/pages/AddFlora';

vi.mock('../../src/http', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AddFlora />
    </MemoryRouter>
  );
}

describe('AddFlora', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.get.mockResolvedValue({ data: [] });
  });

  it('renders the form with a Species field and one initial location card', async () => {
    renderPage();

    expect(await screen.findByLabelText('Species')).toBeInTheDocument();
    expect(screen.getByText('Location 1')).toBeInTheDocument();
    expect(screen.queryByText('Location 2')).not.toBeInTheDocument();
  });

  it('adds a second location card when "Add Another Location" is clicked', async () => {
    renderPage();
    await screen.findByLabelText('Species');

    fireEvent.click(screen.getByRole('button', { name: 'Add Another Location' }));

    expect(screen.getByText('Location 2')).toBeInTheDocument();
  });

  it('shows a validation error and does not call POST /api/flora when species is blank', async () => {
    renderPage();
    await screen.findByLabelText('Species');

    fireEvent.click(screen.getByRole('button', { name: 'Add Plant' }));

    expect(await screen.findByText('Species is required')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('submits valid data to POST /api/flora and navigates to /flora on success', async () => {
    http.post.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByLabelText('Species');

    fireEvent.change(screen.getByLabelText('Species'), {
      target: { value: 'Mango Tree' },
    });
    fireEvent.change(screen.getByLabelText('Location Zone'), {
      target: { value: 'Block A' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Plant' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/api/flora', {
        species: 'Mango Tree',
        common_name: '',
        plant_family: '',
        site_suitability: '',
        color: '',
        max_height_at_maturity: '',
        location: '',
        location_zone: 'Block A',
        health_status: 'healthy',
        health_notes: '',
        image_url: null,
        gps_lat: null,
        gps_lng: null,
      })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/flora'));
  });

  it('keeps the location visible with an error shown when the submission fails, without navigating away', async () => {
    http.post.mockRejectedValue({ response: { data: { error: 'Duplicate location' } } });
    renderPage();
    await screen.findByLabelText('Species');

    fireEvent.change(screen.getByLabelText('Species'), {
      target: { value: 'Mango Tree' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Plant' }));

    expect(await screen.findByText('Duplicate location')).toBeInTheDocument();
    expect(screen.getByText('Location 1')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
