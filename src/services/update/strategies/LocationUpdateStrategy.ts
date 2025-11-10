/**
 * Location update strategy implementation
 * Following the pattern established by other update strategies
 */

import type { AttioRecord } from '../../../types/attio.js';
import type { UpdateStrategy } from './BaseUpdateStrategy.js';
import type { UniversalResourceType } from '../../../handlers/tool-configs/universal/types.js';
import { validateLocationFields } from '../../../objects/locations/attributes.js';
import { shouldUseMockData } from '../../create/index.js';
import { getObjectRecord } from '../../../objects/records/index.js';
import { updateObjectRecord } from '../../../objects/records/index.js';

/**
 * Update strategy for location records
 */
export class LocationUpdateStrategy implements UpdateStrategy {
  /**
   * Execute location update with validation
   */
  async execute(
    _resourceType: string,
    recordId: string,
    updates: Record<string, unknown>
  ): Promise<AttioRecord> {
    if (_resourceType !== 'locations') {
      throw new Error(
        `LocationUpdateStrategy received unsupported resource type: ${_resourceType}`
      );
    }

    // 1) Existence check (skip in mock mode)
    try {
      if (!shouldUseMockData()) {
        await getObjectRecord('locations', recordId);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        throw new Error(
          `Location record ${recordId} not found. Please verify the record exists.`
        );
      }
      throw error;
    }

    // 2) Validate the update fields
    const validation = validateLocationFields(updates, true);
    if (!validation.valid) {
      throw new Error(
        `Invalid location update data: ${validation.errors.join(', ')}`
      );
    }

    // 3) Transform the data for the API
    const transformedData = this.transformLocationData(
      validation.sanitizedFields
    );

    // 4) Execute the update
    return updateObjectRecord('locations', recordId, transformedData);
  }

  /**
   * Update a record (implements UpdateStrategy interface)
   */
  async update(
    recordId: string,
    values: Record<string, unknown>,
    resourceType: UniversalResourceType,
    _context?: Record<string, unknown>
  ): Promise<AttioRecord> {
    return this.execute(resourceType, recordId, values);
  }

  /**
   * Transform location data for the API
   */
  private transformLocationData(
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const transformed: Record<string, unknown> = { ...data };

    // Handle company reference
    if (data.company && typeof data.company === 'string') {
      transformed.company = [
        {
          target_object: 'companies',
          target_record_id: data.company,
        },
      ];
    }

    // Handle decision makers reference
    if (data.decision_makers) {
      if (Array.isArray(data.decision_makers)) {
        transformed.decision_makers = data.decision_makers.map((id) =>
          typeof id === 'string'
            ? { target_object: 'people', target_record_id: id }
            : id
        );
      } else if (typeof data.decision_makers === 'string') {
        transformed.decision_makers = [
          {
            target_object: 'people',
            target_record_id: data.decision_makers,
          },
        ];
      }
    }

    // Handle associated deals reference
    if (data.associated_deals) {
      if (Array.isArray(data.associated_deals)) {
        transformed.associated_deals = data.associated_deals.map((id) =>
          typeof id === 'string'
            ? { target_object: 'deals', target_record_id: id }
            : id
        );
      } else if (typeof data.associated_deals === 'string') {
        transformed.associated_deals = [
          {
            target_object: 'deals',
            target_record_id: data.associated_deals,
          },
        ];
      }
    }

    // Ensure dates are properly formatted
    const dateFields = ['exp_date', 'moved_in', 'move_in_date', 'commencement'];
    for (const field of dateFields) {
      if (transformed[field] && typeof transformed[field] === 'string') {
        // Ensure date is in ISO format
        const date = new Date(transformed[field] as string);
        if (!isNaN(date.getTime())) {
          transformed[field] = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      }
    }

    // Ensure numeric fields are numbers
    if (transformed.sf_occupied !== undefined) {
      transformed.sf_occupied = Number(transformed.sf_occupied);
    }
    if (transformed.floor !== undefined) {
      transformed.floor = Number(transformed.floor);
    }

    return transformed;
  }
}
