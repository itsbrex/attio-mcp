import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultMetadataDiscoveryService } from '../../../src/services/metadata/MetadataDiscoveryService.js';
import { DefaultMetadataErrorService } from '../../../src/services/metadata/MetadataErrorService.js';
import { InMemoryMetadataMetricsService } from '../../../src/services/metadata/MetadataMetricsService.js';
import { DefaultMetadataTransformService } from '../../../src/services/metadata/MetadataTransformService.js';
import type {
  MetadataCacheKey,
  MetadataCacheService,
  MetadataResult,
} from '../../../src/services/metadata/types.js';
import { UniversalResourceType } from '../../../src/handlers/tool-configs/universal/types.js';
import {
  DEFAULT_ATTRIBUTE_DISCOVERY_MAX,
  DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE,
} from '../../../src/utils/attribute-discovery-pagination.js';

class FakeMetadataCacheService implements MetadataCacheService {
  private readonly store = new Map<string, MetadataResult>();

  async getOrLoad(
    key: MetadataCacheKey,
    loader: () => Promise<MetadataResult>
  ) {
    const cacheKey = `${key.resourceType}:${key.objectSlug ?? ''}`;
    if (this.store.has(cacheKey)) {
      return { data: this.store.get(cacheKey)!, fromCache: true };
    }

    const data = await loader();
    this.store.set(cacheKey, data);
    return { data, fromCache: false };
  }
}

const mockGet = vi.fn();
const mockClient = { get: mockGet };

describe('DefaultMetadataDiscoveryService', () => {
  let cacheService: FakeMetadataCacheService;
  let metricsService: InMemoryMetadataMetricsService;
  let service: DefaultMetadataDiscoveryService;

  beforeEach(() => {
    cacheService = new FakeMetadataCacheService();
    metricsService = new InMemoryMetadataMetricsService();
    service = new DefaultMetadataDiscoveryService(
      cacheService,
      metricsService,
      new DefaultMetadataTransformService(),
      new DefaultMetadataErrorService()
    );

    vi.clearAllMocks();
    (globalThis as any).setTestApiClient?.(mockClient);
  });

  it('discovers attributes with caching and metrics', async () => {
    const attributes = [{ title: 'Name', api_slug: 'name', type: 'text' }];
    mockGet.mockResolvedValue({ data: { data: attributes } });

    const first = await service.discoverForType({
      resourceType: UniversalResourceType.COMPANIES,
    });
    const second = await service.discoverForType({
      resourceType: UniversalResourceType.COMPANIES,
    });

    expect(first.mappings).toEqual({ Name: 'name' });
    expect(second.mappings).toEqual({ Name: 'name' });
    expect(mockGet).toHaveBeenCalledTimes(1);

    const summary = metricsService.getMetrics({ includeErrors: true });
    expect(summary.totalRequests).toBe(2);
    expect(summary.cacheHits).toBe(1);
  });

  it('filters task attributes by category without API calls', async () => {
    mockGet.mockReset();

    const result = await service.discoverTasks({ categories: ['basic'] });

    expect(result.resource_type).toBe(UniversalResourceType.TASKS);
    const attributes = result.attributes as Array<{ category?: string }>;
    expect(attributes.every((attr) => attr.category === 'basic')).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns normalized record metadata with mappings and counts', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            title: 'Name',
            api_slug: 'name',
            category: 'basic',
            type: 'text',
          },
          {
            title: 'Notes',
            api_slug: 'notes',
            category: 'extended',
            type: 'text',
          },
        ],
      },
    });

    const result = await service.discoverObject({
      objectSlug: 'companies',
      categories: ['basic'],
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/objects/companies/attributes?categories=basic'
    );
    expect(result.count).toBe(1);
    expect(result.mappings).toEqual({ Name: 'name' });
    expect(result.resource_type).toBe(UniversalResourceType.RECORDS);
    expect(result.objectSlug).toBe('companies');
    expect(Array.isArray(result.attributes)).toBe(true);
    expect((result.attributes as unknown[]).length).toBe(1);
  });

  it(`paginates attribute discovery up to max cap (${DEFAULT_ATTRIBUTE_DISCOVERY_MAX})`, async () => {
    const pageSize = DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE;
    const maxAttributes = DEFAULT_ATTRIBUTE_DISCOVERY_MAX;
    const lastOffset = maxAttributes - pageSize;
    const makeAttrs = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        title: `Attr ${start + i}`,
        api_slug: `attr_${start + i}`,
        type: 'text',
      }));

    // Every page is full; the final page overshoots the cap so the helper
    // must stop at exactly maxAttributes rather than draining the API
    mockGet.mockImplementation(async (path: string) => {
      const offset = Number(
        new URL(path, 'https://api.attio.com').searchParams.get('offset') ?? 0
      );
      const count = offset >= lastOffset ? pageSize + 50 : pageSize;
      return { data: { data: makeAttrs(offset, count) } };
    });

    const result = await service.discoverForType({
      resourceType: UniversalResourceType.COMPANIES,
      useCache: false,
    });

    expect(result.count).toBe(maxAttributes);
    expect(mockGet).toHaveBeenCalledTimes(maxAttributes / pageSize);
  });

  it('stops pagination when a page yields no new attributes', async () => {
    const repeated = [
      { title: 'Name', api_slug: 'name', type: 'text' },
      { title: 'Domain', api_slug: 'domain', type: 'text' },
    ];

    mockGet.mockResolvedValue({ data: { data: repeated } });

    const result = await service.discoverForType({
      resourceType: UniversalResourceType.COMPANIES,
      useCache: false,
    });

    expect(result.count).toBe(2);
    // Stops after first page because it is smaller than the page-size threshold.
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('propagates structured errors from API failures', async () => {
    mockGet.mockRejectedValue(new Error('boom'));

    await expect(
      service.discoverForType({
        resourceType: UniversalResourceType.PEOPLE,
        useCache: false,
      })
    ).rejects.toThrowError('Failed to discover people attributes: boom');
  });
});
