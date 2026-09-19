/**
 * Unit tests for the shared attribute discovery pagination helper
 */

import { describe, it, expect, vi } from 'vitest';
import {
  fetchAllObjectAttributes,
  DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE,
} from '@/utils/attribute-discovery-pagination.js';

const page = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    api_slug: `attr_${start + i}`,
    title: `Attr ${start + i}`,
  }));

describe('fetchAllObjectAttributes', () => {
  it('targets /objects by default without query params on the first page', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: page(0, 3) } });

    const result = await fetchAllObjectAttributes({
      client: { get },
      objectSlug: 'companies',
    });

    expect(result).toHaveLength(3);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/objects/companies/attributes');
  });

  it('targets /lists and passes show_archived when requested', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: page(0, 2) } });

    await fetchAllObjectAttributes({
      client: { get },
      objectSlug: 'list-uuid-1',
      target: 'lists',
      showArchived: true,
    });

    expect(get).toHaveBeenCalledWith(
      '/lists/list-uuid-1/attributes?show_archived=true'
    );
  });

  it('walks offset pages until a short page is returned', async () => {
    const pageSize = DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE;
    const get = vi.fn().mockImplementation((url: string) => {
      if (url === '/objects/people/attributes') {
        return Promise.resolve({ data: { data: page(0, pageSize) } });
      }
      if (
        url ===
        `/objects/people/attributes?limit=${pageSize}&offset=${pageSize}`
      ) {
        return Promise.resolve({ data: { data: page(pageSize, pageSize) } });
      }
      if (
        url ===
        `/objects/people/attributes?limit=${pageSize}&offset=${pageSize * 2}`
      ) {
        return Promise.resolve({ data: { data: page(pageSize * 2, 5) } });
      }
      return Promise.reject(new Error(`Unexpected url ${url}`));
    });

    const result = await fetchAllObjectAttributes({
      client: { get },
      objectSlug: 'people',
    });

    expect(result).toHaveLength(pageSize * 2 + 5);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('stops when a page adds no new attributes (pagination ignored by API)', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { data: page(0, DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE) },
    });

    const result = await fetchAllObjectAttributes({
      client: { get },
      objectSlug: 'deals',
    });

    expect(result).toHaveLength(DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
