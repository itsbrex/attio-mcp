/**
 * Location search strategy implementation
 * Following the pattern established by DealSearchStrategy
 */

import type {
  ListEntryFilter,
  ListEntryFilters,
} from '@/api/operations/types.js';
import {
  SearchType,
  MatchType,
  SortType,
  UniversalResourceType,
} from '@/handlers/tool-configs/universal/types.js';
import { BaseSearchStrategy } from '@/services/search-strategies/BaseSearchStrategy.js';
import type {
  SearchStrategyParams,
  StrategyDependencies,
} from '@/services/search-strategies/interfaces.js';
import { FilterValidationError } from '@/errors/api-errors.js';
import type { UniversalRecordResult } from '@/types/attio.js';

/**
 * Search strategy for locations with fast path optimization
 */
export class LocationSearchStrategy extends BaseSearchStrategy {
  constructor(dependencies: StrategyDependencies) {
    super(dependencies);
  }

  getResourceType(): string {
    return UniversalResourceType.LOCATIONS;
  }

  supportsAdvancedFiltering(): boolean {
    return true;
  }

  supportsQuerySearch(): boolean {
    return true;
  }

  async search(params: SearchStrategyParams): Promise<UniversalRecordResult[]> {
    const {
      query,
      filters,
      limit,
      offset,
      search_type = SearchType.BASIC,
      fields,
      match_type = MatchType.PARTIAL,
      sort = SortType.NAME,
      timeframeParams,
    } = params;

    // Apply timeframe filtering (e.g., for lease expiration dates)
    const enhancedFilters = this.applyTimeframeFiltering(
      filters,
      timeframeParams
    );

    // If we have filters, use advanced search
    if (enhancedFilters) {
      return this.searchWithFilters(enhancedFilters, limit, offset);
    }

    // If we have a query, handle different search types
    if (query && query.trim().length > 0) {
      return this.searchWithQuery(
        query.trim(),
        search_type,
        fields,
        match_type,
        sort,
        limit,
        offset
      );
    }

    // No query and no filters - return paginated results
    return this.searchWithoutQuery(limit, offset);
  }

  /**
   * Search locations using advanced filters
   */
  private async searchWithFilters(
    filters: Record<string, unknown>,
    limit?: number,
    offset?: number
  ): Promise<UniversalRecordResult[]> {
    if (!this.dependencies.advancedSearchFunction) {
      throw new Error('Locations advanced search function not available');
    }

    try {
      // FilterValidationError will bubble up naturally from searchFn
      return await this.dependencies.advancedSearchFunction(
        filters,
        limit,
        offset
      );
    } catch (error: unknown) {
      // Let FilterValidationError bubble up for proper error handling
      if (error instanceof FilterValidationError) {
        throw error;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Search locations with a query string
   */
  private async searchWithQuery(
    query: string,
    searchType: SearchType,
    fields?: string[],
    matchType?: MatchType,
    sort?: SortType,
    limit?: number,
    offset?: number
  ): Promise<UniversalRecordResult[]> {
    if (!this.dependencies.advancedSearchFunction) {
      throw new Error('Locations advanced search function not available');
    }

    // Build filters based on the query and search type
    const filters = this.buildQueryFilters(
      query,
      searchType,
      fields,
      matchType
    );

    try {
      const results = await this.dependencies.advancedSearchFunction(
        filters,
        limit,
        offset
      );

      // Apply sorting if needed
      if (sort === SortType.RELEVANCE && this.dependencies.rankByRelevance) {
        return this.dependencies.rankByRelevance(results, query, fields || []);
      }

      return results;
    } catch (error: unknown) {
      if (error instanceof FilterValidationError) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Get locations without any search criteria
   */
  private async searchWithoutQuery(
    limit?: number,
    offset?: number
  ): Promise<UniversalRecordResult[]> {
    if (!this.dependencies.advancedSearchFunction) {
      throw new Error('Locations advanced search function not available');
    }

    return this.handleEmptyFilters(
      this.dependencies.advancedSearchFunction,
      limit,
      offset
    );
  }

  /**
   * Build filters for query-based search
   */
  private buildQueryFilters(
    query: string,
    searchType: SearchType,
    fields?: string[],
    matchType?: MatchType
  ): Record<string, unknown> {
    const operator = matchType === MatchType.EXACT ? 'equals' : 'contains';

    // Default searchable fields for locations
    const defaultFields = [
      'tenant_name',
      'building_name',
      'address',
      'street_address_1',
      'full_address',
      'city',
      'state',
      'zip_code',
      'space_use',
      'landlord',
      'property_type',
      'location_type',
    ];

    const searchFields = fields && fields.length > 0 ? fields : defaultFields;

    const fieldsToSearch =
      searchType === SearchType.CONTENT ||
      searchType === SearchType.RELATIONSHIP
        ? searchFields
        : ['tenant_name', 'building_name', 'address', 'city'];

    return {
      filters: fieldsToSearch.map((field) => ({
        attribute: { slug: field },
        condition: operator,
        value: query,
      })),
      matchAny: true,
    };
  }

  /**
   * Apply timeframe filtering for date fields (e.g., lease expiration)
   */
  protected applyTimeframeFiltering(
    filters?: Record<string, unknown>,
    timeframeParams?: {
      timeframe_attribute?: string;
      start_date?: string;
      end_date?: string;
      date_operator?: 'greater_than' | 'less_than' | 'between' | 'equals';
    }
  ): Record<string, unknown> | undefined {
    if (!timeframeParams?.timeframe_attribute) {
      return filters;
    }

    const { timeframe_attribute, start_date, end_date, date_operator } =
      timeframeParams;
    const operator = date_operator || 'between';

    // Map common date field aliases to actual field names
    const dateFieldMapping: Record<string, string> = {
      lease_expiration: 'exp_date',
      expiration_date: 'exp_date',
      lxd: 'exp_date',
      move_in: 'move_in_date',
      moved_in: 'moved_in',
      commencement: 'commencement',
      created: 'created_at',
      updated: 'date_last_updated',
    };

    const actualField =
      dateFieldMapping[timeframe_attribute] || timeframe_attribute;

    const dateFilters: ListEntryFilters['filters'] = [];

    if (operator === 'between' && start_date && end_date) {
      dateFilters.push(
        {
          attribute: { slug: actualField },
          value: start_date,
          condition: 'greater_than_or_equal_to',
        },
        {
          attribute: { slug: actualField },
          value: end_date,
          condition: 'less_than_or_equal_to',
        }
      );
    } else if (operator === 'greater_than' && start_date) {
      dateFilters.push({
        attribute: { slug: actualField },
        value: start_date,
        condition: 'greater_than_or_equal_to',
      });
    } else if (operator === 'less_than' && end_date) {
      dateFilters.push({
        attribute: { slug: actualField },
        value: end_date,
        condition: 'less_than_or_equal_to',
      });
    } else if (operator === 'equals' && (start_date || end_date)) {
      dateFilters.push({
        attribute: { slug: actualField },
        value: start_date || end_date || '',
        condition: 'equals',
      });
    }

    if (dateFilters.length === 0) {
      return filters;
    }

    const existingFiltersRaw = (filters as ListEntryFilters | undefined)
      ?.filters;
    const existingFilters: ListEntryFilter[] = Array.isArray(existingFiltersRaw)
      ? existingFiltersRaw
      : [];

    return {
      filters: [...existingFilters, ...dateFilters],
      matchAny: false,
    };
  }
}
