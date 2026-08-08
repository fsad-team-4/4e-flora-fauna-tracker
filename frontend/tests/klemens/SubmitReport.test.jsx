import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import http from '../../src/http';
import SubmitReport from '../../src/pages/SubmitReport';

vi.mock('../../src/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const LOCATION_RULE = /Add a block number or capture your GPS location/;

function renderPage() {
  return render(
    <MemoryRouter>
      <SubmitReport />
    </MemoryRouter>
  );
}

// Fills everything the yup schema requires, so the only thing left standing
// between the form and http.post is the block-number-or-GPS rule.
async function fillRequiredFields() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: 'Pest' }));

  fireEvent.change(screen.getByPlaceholderText('Short summary of the issue'), {
    target: { name: 'title', value: 'Rat near bin centre' },
  });
  fireEvent.change(screen.getByPlaceholderText(/Describe what you saw/), {
    target: { name: 'description', value: 'Seen twice this week by the bin centre.' },
  });

  // Formik validates through yup asynchronously, so each change above leaves a
  // pending promise that calls setState when it resolves. Flush them inside act
  // here, otherwise a test that asserts synchronously finishes first and the
  // updates land after unmount ("not wrapped in act" warnings).
  await act(async () => {});
}

function submitForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
}

function mockGeolocation(latitude, longitude) {
  const getCurrentPosition = vi.fn((success) =>
    success({ coords: { latitude, longitude } })
  );
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}

describe('SubmitReport - location rule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.post.mockResolvedValue({ data: { id: 1 } });
    delete navigator.geolocation;
  });

  it('blocks submit when neither a block number nor GPS is provided', async () => {
    renderPage();
    await fillRequiredFields();

    submitForm();

    expect(await screen.findByText(LOCATION_RULE)).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('does not show the location rule message before a submit attempt', async () => {
    renderPage();
    await fillRequiredFields();

    expect(screen.queryByText(LOCATION_RULE)).not.toBeInTheDocument();
  });

  it('submits with a block number and no GPS', async () => {
    renderPage();
    await fillRequiredFields();
    fireEvent.change(screen.getByPlaceholderText('e.g. Blk 123, Void Deck'), {
      target: { name: 'block_number', value: 'Blk 123' },
    });

    submitForm();

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    const [url, payload] = http.post.mock.calls[0];
    expect(url).toBe('/api/reports');
    expect(payload).toMatchObject({
      category: 'pest',
      title: 'Rat near bin centre',
      block_number: 'Blk 123',
      photo_urls: [],
    });
    expect(payload).not.toHaveProperty('gps_lat');
    expect(screen.queryByText(LOCATION_RULE)).not.toBeInTheDocument();
  });

  it('submits with GPS and no block number', async () => {
    const getCurrentPosition = mockGeolocation(1.3521, 103.8198);
    renderPage();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /Use My Location/ }));
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(await screen.findByText('1.35210, 103.81980')).toBeInTheDocument();

    submitForm();

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post.mock.calls[0][1]).toMatchObject({
      block_number: '',
      gps_lat: 1.3521,
      gps_lng: 103.8198,
    });
  });

  it('clears the location rule message once a block number is entered', async () => {
    renderPage();
    await fillRequiredFields();

    submitForm();
    expect(await screen.findByText(LOCATION_RULE)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. Blk 123, Void Deck'), {
      target: { name: 'block_number', value: 'Blk 123' },
    });

    await waitFor(() =>
      expect(screen.queryByText(LOCATION_RULE)).not.toBeInTheDocument()
    );
  });

  it('treats a whitespace-only block number as no block number', async () => {
    renderPage();
    await fillRequiredFields();
    fireEvent.change(screen.getByPlaceholderText('e.g. Blk 123, Void Deck'), {
      target: { name: 'block_number', value: '   ' },
    });

    submitForm();

    expect(await screen.findByText(LOCATION_RULE)).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('SubmitReport - other behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.post.mockResolvedValue({ data: { id: 1 } });
    delete navigator.geolocation;
  });

  it('shows field validation errors and sends nothing when the form is empty', async () => {
    renderPage();

    submitForm();

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Description is required')).toBeInTheDocument();
    expect(screen.getByText('Category is required')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('surfaces the API error message when the request fails', async () => {
    http.post.mockRejectedValue({ response: { data: { error: 'Report rejected' } } });
    renderPage();
    await fillRequiredFields();
    fireEvent.change(screen.getByPlaceholderText('e.g. Blk 123, Void Deck'), {
      target: { name: 'block_number', value: 'Blk 123' },
    });

    submitForm();

    expect(await screen.findByText('Report rejected')).toBeInTheDocument();
  });

  it('warns but does not block when the browser has no geolocation', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Use My Location/ }));

    expect(
      await screen.findByText('Geolocation is not supported by this browser')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Report' })).toBeEnabled();
  });
});
