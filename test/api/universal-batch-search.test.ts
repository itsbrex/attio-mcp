import { beforeEach, describe, expect, it, vi } from 'vitest';
import { universalBatchSearch } from '../../src/api/operations/batch.js';
import { UniversalResourceType } from '../../src/handlers/tool-configs/universal/types.js';
import { UniversalSearchService } from '../../src/services/UniversalSearchService.js';

describe('universalBatchSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves result ordering for duplicate queries', async () => {
    const query = 'Acme';

    const searchSpy = vi
      .spyOn(UniversalSearchService, 'searchRecords')
      .mockResolvedValueOnce([
        {
          id: { record_id: 'rec-1' },
          values: { name: [{ value: 'First Acme' }] },
        },
      ])
      .mockRejectedValueOnce(new Error('second call failed'));

    const result = await universalBatchSearch(
      UniversalResourceType.RECORDS,
      [query, query],
      { limit: 5 }
    );

    searchSpy.mockRestore();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      success: true,
      query,
    });
    expect(result[1]).toMatchObject({
      success: false,
      query,
      error: 'second call failed',
    });
  });
});
