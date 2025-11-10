/**
 * Location relationship operations
 * Handles relationships between locations and other objects (companies, people, deals)
 */

import type { AttioRecord } from '../../types/attio.js';
import { searchLocationsByCompany } from './search.js';
import { getObjectRecord } from '../../objects/records/index.js';
import { updateObjectRecord } from '../../objects/records/index.js';
import { debug } from '../../utils/logger.js';

/**
 * Get all locations associated with a company
 * @param companyId - The company ID
 * @param limit - Maximum number of results
 * @param offset - Pagination offset
 * @returns Array of location records
 */
export async function getCompanyLocations(
  companyId: string,
  limit?: number,
  offset?: number
): Promise<AttioRecord[]> {
  debug('LocationRelationships', 'Fetching locations for company', {
    companyId,
    limit,
    offset,
  });

  try {
    const locations = await searchLocationsByCompany(companyId, limit, offset);

    debug('LocationRelationships', 'Retrieved company locations', {
      companyId,
      locationCount: locations.length,
    });

    return locations;
  } catch (error: unknown) {
    debug('LocationRelationships', 'Failed to get company locations', {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get the company associated with a location
 * @param locationId - The location record ID
 * @returns The company record or null if not associated
 */
export async function getLocationCompany(
  locationId: string
): Promise<AttioRecord | null> {
  debug('LocationRelationships', 'Fetching company for location', {
    locationId,
  });

  try {
    // Get the location record
    const location = await getObjectRecord('locations', locationId);

    if (!location?.values?.company) {
      debug('LocationRelationships', 'Location has no company association', {
        locationId,
      });
      return null;
    }

    // Extract company ID from the values
    const companyRef = location.values.company;
    let companyId: string | undefined;

    if (Array.isArray(companyRef) && companyRef.length > 0) {
      // Handle array of references
      const firstRef = companyRef[0];
      if (
        typeof firstRef === 'object' &&
        firstRef &&
        'target_record_id' in firstRef
      ) {
        companyId = (firstRef as any).target_record_id;
      } else if (typeof firstRef === 'string') {
        companyId = firstRef;
      }
    } else if (
      typeof companyRef === 'object' &&
      companyRef &&
      'target_record_id' in companyRef
    ) {
      // Handle single reference object
      companyId = (companyRef as any).target_record_id;
    } else if (typeof companyRef === 'string') {
      // Handle simple string ID
      companyId = companyRef;
    }

    if (!companyId) {
      debug(
        'LocationRelationships',
        'Could not extract company ID from location',
        {
          locationId,
          companyRef,
        }
      );
      return null;
    }

    // Fetch the company record
    const company = await getObjectRecord('companies', companyId);

    debug('LocationRelationships', 'Retrieved company for location', {
      locationId,
      companyId,
      companyName: company?.values?.name,
    });

    return company;
  } catch (error: unknown) {
    debug('LocationRelationships', 'Failed to get location company', {
      locationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Link a location to a company
 * @param locationId - The location record ID
 * @param companyId - The company record ID
 * @returns Updated location record
 */
export async function linkLocationToCompany(
  locationId: string,
  companyId: string
): Promise<AttioRecord> {
  debug('LocationRelationships', 'Linking location to company', {
    locationId,
    companyId,
  });

  try {
    // Update the location with the company reference
    const updatedLocation = await updateObjectRecord('locations', locationId, {
      company: [
        {
          target_object: 'companies',
          target_record_id: companyId,
        },
      ],
    });

    debug('LocationRelationships', 'Successfully linked location to company', {
      locationId,
      companyId,
    });

    return updatedLocation;
  } catch (error: unknown) {
    debug('LocationRelationships', 'Failed to link location to company', {
      locationId,
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Unlink a location from its company
 * @param locationId - The location record ID
 * @returns Updated location record
 */
export async function unlinkLocationFromCompany(
  locationId: string
): Promise<AttioRecord> {
  debug('LocationRelationships', 'Unlinking location from company', {
    locationId,
  });

  try {
    // Clear the company reference
    const updatedLocation = await updateObjectRecord('locations', locationId, {
      company: [],
    });

    debug(
      'LocationRelationships',
      'Successfully unlinked location from company',
      {
        locationId,
      }
    );

    return updatedLocation;
  } catch (error: unknown) {
    debug('LocationRelationships', 'Failed to unlink location from company', {
      locationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get people (decision makers) associated with a location
 * @param locationId - The location record ID
 * @returns Array of person records
 */
export async function getLocationPeople(
  locationId: string
): Promise<AttioRecord[]> {
  debug('LocationRelationships', 'Fetching people for location', {
    locationId,
  });

  try {
    // Get the location record
    const location = await getObjectRecord('locations', locationId);

    if (!location?.values?.decision_makers) {
      debug('LocationRelationships', 'Location has no decision makers', {
        locationId,
      });
      return [];
    }

    // Extract people IDs from the values
    const peopleRef = location.values.decision_makers;
    const peopleIds: string[] = [];

    if (Array.isArray(peopleRef)) {
      for (const ref of peopleRef) {
        if (typeof ref === 'object' && ref?.target_record_id) {
          peopleIds.push(ref.target_record_id);
        } else if (typeof ref === 'string') {
          peopleIds.push(ref);
        }
      }
    }

    if (peopleIds.length === 0) {
      return [];
    }

    // Fetch all person records
    const people = await Promise.all(
      peopleIds.map((id) => getObjectRecord('people', id))
    );

    debug('LocationRelationships', 'Retrieved people for location', {
      locationId,
      peopleCount: people.length,
    });

    return people.filter(Boolean) as AttioRecord[];
  } catch (error: unknown) {
    debug('LocationRelationships', 'Failed to get location people', {
      locationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get deals associated with a location
 * @param locationId - The location record ID
 * @returns Array of deal records
 */
export async function getLocationDeals(
  locationId: string
): Promise<AttioRecord[]> {
  debug('LocationRelationships', 'Fetching deals for location', { locationId });

  try {
    // Get the location record
    const location = await getObjectRecord('locations', locationId);

    if (!location?.values?.associated_deals) {
      debug('LocationRelationships', 'Location has no associated deals', {
        locationId,
      });
      return [];
    }

    // Extract deal IDs from the values
    const dealsRef = location.values.associated_deals;
    const dealIds: string[] = [];

    if (Array.isArray(dealsRef)) {
      for (const ref of dealsRef) {
        if (typeof ref === 'object' && ref?.target_record_id) {
          dealIds.push(ref.target_record_id);
        } else if (typeof ref === 'string') {
          dealIds.push(ref);
        }
      }
    }

    if (dealIds.length === 0) {
      return [];
    }

    // Fetch all deal records
    const deals = await Promise.all(
      dealIds.map((id) => getObjectRecord('deals', id))
    );

    debug('LocationRelationships', 'Retrieved deals for location', {
      locationId,
      dealCount: deals.length,
    });

    return deals.filter(Boolean) as AttioRecord[];
  } catch (error: unknown) {
    debug('LocationRelationships', 'Failed to get location deals', {
      locationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
