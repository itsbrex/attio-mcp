import { describe, it, expect } from 'vitest';

import {
  extractDisplayName,
  extractRecordDisplayName,
  extractDisplayValue,
  extractMultipleDisplayValues,
} from '../../../../../src/handlers/tool-configs/universal/core/value-extractors.js';
import { UniversalResourceType } from '../../../../../src/handlers/tool-configs/universal/types.js';

describe('value-extractors', () => {
  it('returns primary field for companies', () => {
    const name = extractDisplayName(
      {
        name: [{ value: 'Acme Inc.' }],
        description: 'A company',
      },
      UniversalResourceType.COMPANIES
    );

    expect(name).toBe('Acme Inc.');
  });

  it('falls back to secondary company fields', () => {
    const name = extractDisplayName(
      {
        legal_name: [{ value: 'Acme Legal' }],
      },
      UniversalResourceType.COMPANIES
    );

    expect(name).toBe('Acme Legal');
  });

  it('extracts value from string arrays', () => {
    const value = extractDisplayValue(['Primary Value', 'Secondary Value']);
    expect(value).toBe('Primary Value');
  });

  it('extracts from Attio field value arrays', () => {
    const value = extractDisplayValue([
      { formatted: '', value: 'Entry One' },
      { value: 'Entry Two' },
    ]);

    expect(value).toBe('Entry One');
  });

  it('handles nested value objects', () => {
    const value = extractDisplayValue({ value: { value: 'Nested' } });
    expect(value).toBe('Nested');
  });

  it('extracts multiple display values', () => {
    const result = extractMultipleDisplayValues(
      {
        stage: [{ value: 'qualified' }],
        owner: [{ value: 'Jane Doe' }],
      },
      ['stage', 'owner', 'missing']
    );

    expect(result).toEqual({
      stage: 'qualified',
      owner: 'Jane Doe',
    });
  });

  it('returns Unnamed when no fields match', () => {
    const name = extractDisplayName({}, UniversalResourceType.RECORDS);
    expect(name).toBe('Unnamed');
  });

  it('prefers person name composed from name array', () => {
    const name = extractDisplayName(
      {
        name: [{ full_name: 'John Doe' }],
        email_addresses: [{ email_address: 'john@example.com' }],
      },
      UniversalResourceType.PEOPLE
    );

    expect(name).toBe('John Doe');
  });

  it('extracts display name from custom-object name fields like tenant_name', () => {
    const name = extractRecordDisplayName(
      {
        values: {
          tenant_name: [{ value: 'Apex Logistics' }],
          address: [{ value: '123 Main St' }],
        },
      },
      UniversalResourceType.LOCATIONS
    );

    expect(name).toBe('Apex Logistics');
  });

  it('falls back to top-level record title when values have no name fields', () => {
    const name = extractRecordDisplayName({
      title: 'Top Level Record Title',
      values: {
        exp_date: [{ value: '2027-06-01' }],
      },
    });

    expect(name).toBe('Top Level Record Title');
  });
});
