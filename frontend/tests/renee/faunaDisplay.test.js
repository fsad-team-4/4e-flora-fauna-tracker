import {
  severityFor,
  statusLabel,
  speciesLabel,
  formatBlock,
  tokenVariant,
} from '../../src/faunaDisplay';

// Pure display helpers - no DOM, no router, no http, so nothing is mocked here.

describe('severityFor', () => {
  it('is Urgent when the tags include aggressive', () => {
    expect(severityFor(['aggressive']).label).toBe('Urgent');
    expect(severityFor(['aggressive']).color).toBe('error');
  });

  it('is Monitor when the tags include nesting but not aggressive', () => {
    expect(severityFor(['nesting']).label).toBe('Monitor');
    expect(severityFor(['nesting']).color).toBe('warning');
  });

  it('is Routine for tags that carry no severity', () => {
    expect(severityFor(['feeding', 'droppings']).label).toBe('Routine');
  });

  it('is Routine for an empty tag array', () => {
    expect(severityFor([]).label).toBe('Routine');
  });

  it('is Routine when tags are missing entirely', () => {
    // The list and detail pages call this before the sighting has loaded.
    expect(severityFor(undefined).label).toBe('Routine');
    expect(severityFor(null).label).toBe('Routine');
  });

  it('lets aggressive win when both aggressive and nesting are present', () => {
    expect(severityFor(['nesting', 'aggressive']).label).toBe('Urgent');
    // order in the array must not change the outcome
    expect(severityFor(['aggressive', 'nesting']).label).toBe('Urgent');
  });
});

describe('statusLabel', () => {
  it('maps each stored status to its display label', () => {
    expect(statusLabel('open')).toBe('Open');
    expect(statusLabel('in_progress')).toBe('In Progress');
    expect(statusLabel('resolved')).toBe('Resolved');
  });

  it('passes an unrecognised value through unchanged', () => {
    expect(statusLabel('archived')).toBe('archived');
  });
});

describe('speciesLabel', () => {
  it('capitalises each of the five species', () => {
    expect(speciesLabel('cat')).toBe('Cat');
    expect(speciesLabel('pigeon')).toBe('Pigeon');
    expect(speciesLabel('crow')).toBe('Crow');
    expect(speciesLabel('mynah')).toBe('Mynah');
    expect(speciesLabel('other')).toBe('Other');
  });

  it('passes an unrecognised value through unchanged', () => {
    expect(speciesLabel('otter')).toBe('otter');
  });
});

describe('formatBlock', () => {
  it('prefixes a bare block number', () => {
    expect(formatBlock('605')).toBe('Block 605');
    expect(formatBlock('12A')).toBe('Block 12A');
  });

  it('leaves an already-prefixed value unchanged', () => {
    expect(formatBlock('Block 123')).toBe('Block 123');
  });

  it('matches the prefix case-insensitively', () => {
    expect(formatBlock('block 123')).toBe('block 123');
    expect(formatBlock('BLOCK 123')).toBe('BLOCK 123');
  });

  it('does not double-prefix when "block" appears later in the string', () => {
    expect(formatBlock('Near Block 126')).toBe('Near Block 126');
    expect(formatBlock('Behind block 5 carpark')).toBe('Behind block 5 carpark');
  });

  it('returns an empty string for empty or missing input', () => {
    expect(formatBlock('')).toBe('');
    expect(formatBlock(undefined)).toBe('');
    expect(formatBlock(null)).toBe('');
  });
});

describe('tokenVariant', () => {
  it('is outlined for a neutral token', () => {
    expect(tokenVariant(undefined)).toBe('outlined');
    expect(tokenVariant('default')).toBe('outlined');
  });

  it('is outlined for success, so a non-issue never shouts', () => {
    expect(tokenVariant('success')).toBe('outlined');
  });

  it('is filled for any other colour', () => {
    expect(tokenVariant('error')).toBe('filled');
    expect(tokenVariant('warning')).toBe('filled');
    expect(tokenVariant('info')).toBe('filled');
  });
});
