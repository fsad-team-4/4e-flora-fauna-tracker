import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import http from '../../src/http';
import FaunaSightingDetail from '../../src/pages/FaunaSightingDetail';

vi.mock('../../src/http', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

// The role comes from useUser(), which the real UserProvider derives from a JWT
// in localStorage. localStorage has no working methods in this jsdom setup, so
// the ProtectedRoute pattern of seeding a token cannot be used here - the hook
// is mocked instead and `mockUser` is swapped per test.
const { mockUser } = vi.hoisted(() => ({ mockUser: { current: null } }));
vi.mock('../../src/contexts/UserContext', () => ({
  useUser: () => ({ user: mockUser.current, setUser: vi.fn() }),
}));

const OFFICER = { user_id: 1, role: 'field_officer', name: 'Officer Tan' };
const MANAGER = { user_id: 2, role: 'manager', name: 'Estate Admin' };
const PARTNER = { user_id: 3, role: 'welfare_partner', name: 'Cat Welfare' };

function makeSighting(overrides = {}) {
  return {
    id: 7,
    species: 'crow',
    block_number: 'Block 203',
    floor_level: 'Roof',
    behaviour_tags: ['nesting'],
    gps_lat: 1.38872,
    gps_lng: 103.90379,
    photo_url: null,
    notes: 'Crow nest on the rooftop antenna mount.',
    status: 'open',
    reported_by: 1,
    is_deleted: false,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    reporter: { id: 1, name: 'Officer Tan' },
    ...overrides,
  };
}

// Renders the page at a real /fauna/:id route so useParams gives the component
// an id, then waits for the initial GET to settle.
async function renderPage() {
  const result = render(
    <MemoryRouter initialEntries={['/fauna/7']}>
      <Routes>
        <Route path="/fauna/:id" element={<FaunaSightingDetail />} />
      </Routes>
    </MemoryRouter>
  );
  await act(async () => {});
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.current = OFFICER;
  http.get.mockResolvedValue({ data: makeSighting() });
  http.patch.mockResolvedValue({ data: {} });
});

describe('FaunaSightingDetail - details', () => {
  it('shows species, status, severity, block and notes', async () => {
    await renderPage();

    expect(http.get).toHaveBeenCalledWith('/api/fauna/7');
    expect(screen.getByRole('heading', { name: 'Crow' })).toBeInTheDocument();
    // "Open" renders twice for a staff user: the status chip and the select's
    // current value, so this asserts presence rather than uniqueness.
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    // severity is derived from behaviour_tags: nesting -> Monitor
    expect(screen.getByText('Monitor')).toBeInTheDocument();
    expect(screen.getByText('Block 203')).toBeInTheDocument();
    expect(screen.getByText('Crow nest on the rooftop antenna mount.')).toBeInTheDocument();
    expect(screen.getByText('Recommended agency: ACRES')).toBeInTheDocument();
    expect(screen.getByText('nesting')).toBeInTheDocument();
    expect(screen.getByText('Reported by: Officer Tan')).toBeInTheDocument();
  });

  it('shows Urgent when a sighting is tagged aggressive', async () => {
    http.get.mockResolvedValue({ data: makeSighting({ behaviour_tags: ['aggressive'] }) });

    await renderPage();

    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('shows the load error when the request fails', async () => {
    http.get.mockRejectedValue({ response: { status: 403 } });

    await renderPage();

    expect(screen.getByText('You do not have access to this sighting.')).toBeInTheDocument();
  });
});

describe('FaunaSightingDetail - role gating', () => {
  it.each([
    ['field_officer', OFFICER],
    ['manager', MANAGER],
  ])('shows the status and block controls for %s', async (_label, user) => {
    mockUser.current = user;

    await renderPage();

    expect(screen.getByRole('button', { name: 'Update Status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change block number' })).toBeInTheDocument();
  });

  it('hides both controls from a welfare partner', async () => {
    mockUser.current = PARTNER;

    await renderPage();

    // the sighting itself still renders - only the mutations are withheld
    expect(screen.getByRole('heading', { name: 'Crow' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update Status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change block number' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set block number' })).not.toBeInTheDocument();
  });
});

describe('FaunaSightingDetail - status update', () => {
  it('patches the status and shows the new value', async () => {
    await renderPage();

    // the button is disabled until the selection actually differs
    expect(screen.getByRole('button', { name: 'Update Status' })).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Resolved' }));

    const button = screen.getByRole('button', { name: 'Update Status' });
    expect(button).toBeEnabled();

    // the reload after the patch returns the updated sighting
    http.get.mockResolvedValue({ data: makeSighting({ status: 'resolved' }) });
    fireEvent.click(button);

    await waitFor(() => expect(http.patch).toHaveBeenCalledTimes(1));
    expect(http.patch).toHaveBeenCalledWith('/api/fauna/7/status', { status: 'resolved' });
    // the page reloads the sighting, so the status chip now reads Resolved
    await waitFor(() => expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0));
  });

  it('surfaces the API error when the status patch fails', async () => {
    http.patch.mockRejectedValue({ response: { data: { error: 'Forbidden' } } });
    await renderPage();

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Resolved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });
});

describe('FaunaSightingDetail - setting a block on a blockless sighting', () => {
  beforeEach(() => {
    http.get.mockResolvedValue({ data: makeSighting({ block_number: null }) });
  });

  it('offers "Set block number" and an empty input', async () => {
    await renderPage();

    expect(screen.getByText('No block number recorded')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set block number' }));

    expect(screen.getByLabelText('Block number')).toHaveValue('');
  });

  it('confirms with the "set" wording and patches the block endpoint', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Set block number' }));
    fireEvent.change(screen.getByLabelText('Block number'), { target: { value: 'Block 305' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/Set block number to "Block 305"\?/)
    ).toBeInTheDocument();
    expect(screen.getByText(/attribute the sighting to that block's summary/)).toBeInTheDocument();

    // the reload after the patch returns the newly attributed sighting
    http.get.mockResolvedValue({ data: makeSighting({ block_number: 'Block 305' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(http.patch).toHaveBeenCalledTimes(1));
    expect(http.patch).toHaveBeenCalledWith('/api/fauna/7/block', { block_number: 'Block 305' });

    // the page refreshed, so the action becomes "Change" and the block now shows.
    // Waiting on the button rather than the text: "Block 305" also appears inside
    // the confirmation dialog, which would match before the reload lands.
    expect(
      await screen.findByRole('button', { name: 'Change block number' })
    ).toBeInTheDocument();
    expect(screen.getByText('Block 305')).toBeInTheDocument();
  });

  it('trims the value before sending it', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Set block number' }));
    fireEvent.change(screen.getByLabelText('Block number'), {
      target: { value: '  Block 305  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(http.patch).toHaveBeenCalledTimes(1));
    expect(http.patch.mock.calls[0][1]).toEqual({ block_number: 'Block 305' });
  });

  it('will not open the confirmation for an empty or whitespace-only value', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Set block number' }));

    // empty to start with
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Block number'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(http.patch).not.toHaveBeenCalled();
  });

  it('surfaces the API error when the block patch fails', async () => {
    http.patch.mockRejectedValue({ response: { data: { error: 'Sighting not found' } } });
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Set block number' }));
    fireEvent.change(screen.getByLabelText('Block number'), { target: { value: 'Block 305' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Sighting not found')).toBeInTheDocument();
  });

  it('joins an array of validation messages from the API', async () => {
    http.patch.mockRejectedValue({
      response: { data: { error: ['block_number is a required field'] } },
    });
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Set block number' }));
    fireEvent.change(screen.getByLabelText('Block number'), { target: { value: 'Block 305' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('block_number is a required field')).toBeInTheDocument();
  });
});

describe('FaunaSightingDetail - changing an existing block', () => {
  it('pre-fills the input with the current block', async () => {
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Change block number' }));

    expect(screen.getByLabelText('Block number')).toHaveValue('Block 203');
  });

  it('confirms with the "change from/to" wording', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Change block number' }));
    fireEvent.change(screen.getByLabelText('Block number'), { target: { value: 'Block 999' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/Change block number from "Block 203" to "Block 999"\?/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/move the sighting into that block's summary/)
    ).toBeInTheDocument();
  });

  it('will not confirm when the value is unchanged', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Change block number' }));

    // pre-filled with the current block, so there is nothing to save yet
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Block number'), { target: { value: 'Block 999' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('cancelling the editor hides the input without patching', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Change block number' }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Block number')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change block number' })).toBeInTheDocument();
    expect(http.patch).not.toHaveBeenCalled();
  });
});
