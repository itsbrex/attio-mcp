/**
 * Locations search operations
 * Provides advanced search functionality for location records
 */

import type { AttioRecord } from '../../types/attio.js';
import type { ListEntryFilters } from '../../objects/lists.js';
import { listObjectRecords } from '../../objects/records/index.js';
import { debug } from '../../utils/logger.js';

/**
 * Advanced search for locations with filter validation
 * @param filters - Search filters for locations
 * @param limit - Maximum number of results
 * @param offset - Pagination offset
 * @returns Array of location records
 */
export async function advancedSearchLocations(
  filters: ListEntryFilters,
  limit?: number,
  offset?: number
): Promise<AttioRecord[]> {
  // Strict validation
  if (!filters || typeof filters !== 'object') {
    throw new Error('Invalid filter structure: Filters must be an object');
  }

  // Log the search operation
  debug('LocationSearch', 'Advanced search for locations', {
    hasFilters: !!filters,
    filterKeys: filters ? Object.keys(filters) : [],
    limit,
    offset,
  });

  try {
    // Use listObjectRecords to search
    const results = await listObjectRecords('locations', { limit, offset });

    debug('LocationSearch', 'Advanced search completed', {
      resultCount: results.length,
      limit,
      offset,
    });

    return results;
  } catch (error: unknown) {
    // Log and re-throw errors
    debug('LocationSearch', 'Advanced search failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Search locations by company
 * @param companyId - The company ID to search for
 * @param limit - Maximum number of results
 * @param offset - Pagination offset
 * @returns Array of location records associated with the company
 */
export async function searchLocationsByCompany(
  companyId: string,
  limit?: number,
  offset?: number
): Promise<AttioRecord[]> {
  const filters: ListEntryFilters = {
    filter: {
      $or: [
        {
          field: 'company',
          value: companyId,
          operator: 'equals',
        },
      ],
    },
  };

  return advancedSearchLocations(filters, limit, offset);
}

/**
 * Search locations by address components
 * @param params - Address search parameters
 * @returns Array of matching location records
 */
export async function searchLocationsByAddress(params: {
  city?: string;
  state?: string;
  zipCode?: string;
  street?: string;
  limit?: number;
  offset?: number;
}): Promise<AttioRecord[]> {
  const conditions: unknown[] = [];

  if (params.city) {
    conditions.push({
      field: 'city',
      value: params.city,
      operator: 'contains',
    });
  }

  if (params.state) {
    conditions.push({
      field: 'state',
      value: params.state,
      operator: 'equals',
    });
  }

  if (params.zipCode) {
    conditions.push({
      field: 'zip_code',
      value: params.zipCode,
      operator: 'equals',
    });
  }

  if (params.street) {
    conditions.push({
      field: 'street_address_1',
      value: params.street,
      operator: 'contains',
    });
  }

  if (conditions.length === 0) {
    throw new Error('At least one address component is required for search');
  }

  const filters: ListEntryFilters = {
    filter: {
      $and: conditions,
    },
  };

  return advancedSearchLocations(filters, params.limit, params.offset);
}

/**
 * Search locations by lease expiration date range
 * @param startDate - Start of date range (ISO format)
 * @param endDate - End of date range (ISO format)
 * @param limit - Maximum number of results
 * @param offset - Pagination offset
 * @returns Array of location records with leases expiring in the range
 */
export async function searchLocationsByLeaseExpiration(
  startDate: string,
  endDate: string,
  limit?: number,
  offset?: number
): Promise<AttioRecord[]> {
  const filters: ListEntryFilters = {
    filter: {
      $and: [
        {
          field: 'exp_date',
          value: startDate,
          operator: 'greater_than_or_equal_to',
        },
        {
          field: 'exp_date',
          value: endDate,
          operator: 'less_than_or_equal_to',
        },
      ],
    },
  };

  return advancedSearchLocations(filters, limit, offset);
}

/**
 * Search locations by square footage range
 * @param minSqFt - Minimum square footage
 * @param maxSqFt - Maximum square footage
 * @param limit - Maximum number of results
 * @param offset - Pagination offset
 * @returns Array of location records within the size range
 */
export async function searchLocationsBySize(
  minSqFt?: number,
  maxSqFt?: number,
  limit?: number,
  offset?: number
): Promise<AttioRecord[]> {
  const conditions: unknown[] = [];

  if (minSqFt !== undefined) {
    conditions.push({
      field: 'sf_occupied',
      value: minSqFt,
      operator: 'greater_than_or_equal_to',
    });
  }

  if (maxSqFt !== undefined) {
    conditions.push({
      field: 'sf_occupied',
      value: maxSqFt,
      operator: 'less_than_or_equal_to',
    });
  }

  if (conditions.length === 0) {
    throw new Error('At least one size constraint is required');
  }

  const filters: ListEntryFilters = {
    filter: {
      $and: conditions,
    },
  };

  return advancedSearchLocations(filters, limit, offset);
}
