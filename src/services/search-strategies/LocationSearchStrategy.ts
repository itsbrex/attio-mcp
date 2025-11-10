/**
 * Location search strategy implementation
 * Following the pattern established by DealSearchStrategy
 */

import { AttioRecord } from '../../types/attio.js';
import {
  SearchType,
  MatchType,
  SortType,
  UniversalResourceType,
} from '../../handlers/tool-configs/universal/types.js';
import { BaseSearchStrategy } from './BaseSearchStrategy.js';
import { SearchStrategyParams, StrategyDependencies } from './interfaces.js';
import { FilterValidationError } from '../../errors/api-errors.js';

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

  async search(params: SearchStrategyParams): Promise<AttioRecord[]> {
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
  ): Promise<AttioRecord[]> {
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
  ): Promise<AttioRecord[]> {
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
      if (sort && this.dependencies.rankByRelevance) {
        return this.dependencies.rankByRelevance(results, query, sort);
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
  ): Promise<AttioRecord[]> {
    if (!this.dependencies.advancedSearchFunction) {
      throw new Error('Locations advanced search function not available');
    }

    // Use empty filters to get all locations
    return await this.dependencies.advancedSearchFunction({}, limit, offset);
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

    if (
      searchType === SearchType.CONTENT ||
      searchType === SearchType.RELATIONSHIP
    ) {
      // Search across multiple fields with OR logic
      const conditions = searchFields.map((field) => ({
        field,
        value: query,
        operator,
      }));

      return {
        filter: {
          $or: conditions,
        },
      };
    } else {
      // Basic search - focus on primary fields
      const basicFields = ['tenant_name', 'building_name', 'address', 'city'];
      const conditions = basicFields.map((field) => ({
        field,
        value: query,
        operator,
      }));

      return {
        filter: {
          $or: conditions,
        },
      };
    }
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

    // Build date filter conditions
    const dateConditions: unknown[] = [];

    if (date_operator === 'between' && start_date && end_date) {
      dateConditions.push(
        {
          field: actualField,
          value: start_date,
          operator: 'greater_than_or_equal_to',
        },
        {
          field: actualField,
          value: end_date,
          operator: 'less_than_or_equal_to',
        }
      );
    } else if (date_operator === 'greater_than' && start_date) {
      dateConditions.push({
        field: actualField,
        value: start_date,
        operator: 'greater_than',
      });
    } else if (date_operator === 'less_than' && end_date) {
      dateConditions.push({
        field: actualField,
        value: end_date,
        operator: 'less_than',
      });
    } else if (date_operator === 'equals' && start_date) {
      dateConditions.push({
        field: actualField,
        value: start_date,
        operator: 'equals',
      });
    }

    if (dateConditions.length === 0) {
      return filters;
    }

    // Merge with existing filters
    if (filters?.filter) {
      return {
        filter: {
          $and: [
            filters.filter,
            ...(dateConditions.length === 1
              ? dateConditions
              : [{ $and: dateConditions }]),
          ],
        },
      };
    } else {
      return {
        filter:
          dateConditions.length === 1
            ? dateConditions[0]
            : { $and: dateConditions },
      };
    }
  }
}
