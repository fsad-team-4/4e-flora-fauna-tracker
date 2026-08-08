import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import http from '../../src/http';
import FaunaLogSighting from '../../src/pages/FaunaLogSighting';

vi.mock('../../src/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <FaunaLogSighting />
    </MemoryRouter>
  );
}

// Fills the three yup-required fields. Each argument can be omitted to leave
// that field blank, which is how the validation tests isolate one rule at a time.
async function fillRequiredFields({
  species = 'Cat',
  block = 'Block 203',
  notes = 'Cat resting at the void deck bench.',
} = {}) {
  if (species) {
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: species }));
  }
  if (block) {
    fireEvent.change(screen.getByLabelText(/Block Number/), {
      target: { name: 'block_number', value: block },
    });
  }
  if (notes) {
    fireEvent.change(screen.getByLabelText(/Notes/), {
      target: { name: 'notes', value: notes },
    });
  }

  // Formik validates through yup asynchronously, so each change above leaves a
  // pending promise that calls setState when it resolves. Flush them inside act
  // here, otherwise a test that asserts synchronously finishes first and the
  // updates land after unmount ("not wrapped in act" warnings).
  await act(async () => {});
}

// No field carries a native `required` attribute, so a click always reaches
// formik and yup owns every error message.
function submitForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Log Sighting' }));
}

describe('FaunaLogSighting - submitting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.post.mockResolvedValue({ data: { id: 1 } });
    delete navigator.geolocation;
  });

  it('posts the sighting when species, block and description are filled', async () => {
    renderPage();
    await fillRequiredFields();

    submitForm();

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    const [url, payload] = http.post.mock.calls[0];
    expect(url).toBe('/api/fauna');
    expect(payload).toMatchObject({
      species: 'cat',
      block_number: 'Block 203',
      notes: 'Cat resting at the void deck bench.',
      behaviour_tags: [],
    });
    // no photo uploaded and no GPS captured, so neither key is sent
    expect(payload).not.toHaveProperty('photo_url');
    expect(payload).not.toHaveProperty('gps_lat');
  });

  it('submits with no behaviour tags checked (they are optional)', async () => {
    renderPage();
    await fillRequiredFields();

    expect(screen.getByRole('checkbox', { name: 'nesting' })).not.toBeChecked();

    submitForm();

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post.mock.calls[0][1].behaviour_tags).toEqual([]);
  });

  it('sends the behaviour tags that were checked', async () => {
    renderPage();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('checkbox', { name: 'nesting' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'aggressive' }));
    await act(async () => {});

    submitForm();

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post.mock.calls[0][1].behaviour_tags).toEqual(['nesting', 'aggressive']);
  });
});

describe('FaunaLogSighting - validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.post.mockResolvedValue({ data: { id: 1 } });
    delete navigator.geolocation;
  });

  it('shows every field error and sends nothing when the form is empty', async () => {
    renderPage();

    submitForm();

    expect(await screen.findByText('Species is required')).toBeInTheDocument();
    expect(screen.getByText('Block number is required')).toBeInTheDocument();
    expect(screen.getByText('Description is required')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('blocks submit when species is missing', async () => {
    renderPage();
    await fillRequiredFields({ species: null });

    submitForm();

    expect(await screen.findByText('Species is required')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('blocks submit when the block number is missing', async () => {
    renderPage();
    await fillRequiredFields({ block: null });

    submitForm();

    expect(await screen.findByText('Block number is required')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('blocks submit when the description is missing', async () => {
    renderPage();
    await fillRequiredFields({ notes: null });

    submitForm();

    expect(await screen.findByText('Description is required')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only description like a missing one', async () => {
    // yup trims before the required test, mirroring the backend schema.
    renderPage();
    await fillRequiredFields({ notes: '   ' });

    submitForm();

    expect(await screen.findByText('Description is required')).toBeInTheDocument();
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('FaunaLogSighting - GPS and API errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.post.mockResolvedValue({ data: { id: 1 } });
    delete navigator.geolocation;
  });

  it('warns but does not block when the browser has no geolocation', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Use My Location/ }));

    expect(
      await screen.findByText('Geolocation is not supported by this browser')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log Sighting' })).toBeEnabled();
  });

  it('still submits after geolocation is unavailable, without GPS keys', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Use My Location/ }));
    await fillRequiredFields();

    submitForm();

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    const payload = http.post.mock.calls[0][1];
    expect(payload).not.toHaveProperty('gps_lat');
    expect(payload).not.toHaveProperty('gps_lng');
  });

  it('attaches the coordinates when Use My Location succeeds', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success) =>
          success({ coords: { latitude: 1.3521, longitude: 103.8198 } })
        ),
      },
      configurable: true,
    });

    renderPage();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /Use My Location/ }));
    expect(await screen.findByText('1.35210, 103.81980')).toBeInTheDocument();

    submitForm();

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post.mock.calls[0][1]).toMatchObject({
      gps_lat: 1.3521,
      gps_lng: 103.8198,
    });
  });

  it('surfaces the API error message when the request fails', async () => {
    http.post.mockRejectedValue({ response: { data: { error: 'Forbidden' } } });
    renderPage();
    await fillRequiredFields();

    submitForm();

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });

  it('joins an array of validation messages from the API', async () => {
    // The backend returns yup errors as an array: { error: [...messages] }.
    http.post.mockRejectedValue({
      response: { data: { error: ['block_number is a required field', 'notes must be at most 500 characters'] } },
    });
    renderPage();
    await fillRequiredFields();

    submitForm();

    expect(
      await screen.findByText(
        'block_number is a required field, notes must be at most 500 characters'
      )
    ).toBeInTheDocument();
  });

  it('falls back to a generic message when the error has no body', async () => {
    http.post.mockRejectedValue(new Error('Network Error'));
    renderPage();
    await fillRequiredFields();

    submitForm();

    expect(await screen.findByText('Failed to log sighting')).toBeInTheDocument();
  });
});
