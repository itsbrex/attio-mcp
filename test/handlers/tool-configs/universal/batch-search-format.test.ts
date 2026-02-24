import { describe, expect, it } from 'vitest';
import { batchSearchConfig } from '../../../../src/handlers/tool-configs/universal/batch-search.js';
import { UniversalResourceType } from '../../../../src/handlers/tool-configs/universal/types.js';

describe('batch_search_records formatter', () => {
  it('formats location batch results with default fields when called with args object', () => {
    const results = [
      {
        success: true,
        query: 'lxd between dates',
        result: [
          {
            id: { record_id: 'loc-1' },
            web_url: 'https://app.attio.com/acme/custom/locations/record/loc-1',
            values: {
              tenant_name: [{ value: 'Acme HQ - Irvine - 10000 sf' }],
              exp_date: [{ value: '2027-01-01' }],
              sf_occupied: [{ value: 10000 }],
              landlord: [{ value: 'Landlord LLC' }],
              market_2: [{ option: { title: 'Orange County' } }],
              submarket: [{ option: { title: 'Irvine Spectrum' } }],
              street_address_1: [{ value: '100 Main St' }],
              company: [{ target_record_id: 'comp-1' }],
            },
          },
        ],
      },
    ];

    const formatted = (batchSearchConfig.formatResult as any)(results, {
      resource_type: UniversalResourceType.LOCATIONS,
    });

    expect(formatted).toContain(
      'Batch search completed: 1 successful, 0 failed'
    );
    expect(formatted).toContain('LXD: 2027-01-01');
    expect(formatted).toContain('SF Occupied: 10000');
    expect(formatted).toContain('Street Address: 100 Main St');
    expect(formatted).toContain(
      'Company URL: https://app.attio.com/acme/company/comp-1'
    );
  });
});
