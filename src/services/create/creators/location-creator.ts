/**
 * Location creator implementation
 * Following the pattern established by other resource creators
 */

import { BaseCreator } from './base-creator.js';
import type { ResourceCreatorContext } from './types.js';
import type { AttioRecord } from '../../../types/attio.js';
import { validateLocationFields } from '../../../objects/locations/attributes.js';

/**
 * Creator implementation for location records
 */
export class LocationCreator extends BaseCreator {
  readonly resourceType = 'locations';
  readonly endpoint = '/objects/locations/records';

  /**
   * Creates a location record
   */
  async create(
    input: Record<string, unknown>,
    context: ResourceCreatorContext
  ): Promise<AttioRecord> {
    // Validate the data
    const validation = await this.validateResourceData(input, context);
    if (!validation.isValid) {
      throw new Error(
        `Location validation failed: ${validation.errors.join(', ')}`
      );
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      context.debug('LocationCreator', 'Validation warnings', {
        warnings: validation.warnings,
      });
    }

    // Transform the data
    const transformedData = await this.transformData(input, context);

    // Build the request payload
    const payload = this.buildRequestPayload(transformedData);

    // Make the API call
    context.debug('LocationCreator', 'Creating location', {
      endpoint: this.endpoint,
      hasPayload: !!payload,
    });

    const response = await context.client.post(this.endpoint, payload);

    // Process the response
    const record = await this.processResponse(
      response.data,
      context,
      transformedData
    );

    // Post-process if needed
    return this.postProcess(record, context);
  }

  /**
   * Validate location-specific data
   */
  protected async validateResourceData(
    data: Record<string, unknown>,
    context: ResourceCreatorContext
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const warnings: string[] = [];

    // Use the location-specific validation
    const validation = validateLocationFields(data, false);

    // Add warnings for commonly missing fields
    if (!data.city) {
      warnings.push('City is recommended for location records');
    }
    if (!data.state) {
      warnings.push('State is recommended for location records');
    }
    if (!data.zip_code) {
      warnings.push('Zip code is recommended for location records');
    }
    if (!data.sf_occupied) {
      warnings.push(
        'Square footage (sf_occupied) is recommended for location records'
      );
    }
    if (!data.company) {
      warnings.push('Company association is recommended for location records');
    }

    return {
      isValid: validation.valid,
      errors: validation.errors,
      warnings,
    };
  }

  /**
   * Transform location data for the API
   */
  protected async transformData(
    data: Record<string, unknown>,
    context: ResourceCreatorContext
  ): Promise<Record<string, unknown>> {
    const transformed: Record<string, unknown> = {};

    // Use the sanitized fields from validation
    const validation = validateLocationFields(data, false);
    if (validation.valid) {
      Object.assign(transformed, validation.sanitizedFields);
    } else {
      // Fallback to basic transformation if validation failed
      Object.assign(transformed, data);
    }

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

  /**
   * Post-process created location record
   */
  protected async postProcess(
    record: AttioRecord,
    context: ResourceCreatorContext
  ): Promise<AttioRecord> {
    // Add any location-specific post-processing
    // For now, just return the record as-is
    return record;
  }

  /**
   * Build request payload for location creation
   */
  protected buildRequestPayload(
    transformedData: Record<string, unknown>
  ): Record<string, unknown> {
    // Wrap the data in the expected API format
    return {
      data: {
        values: transformedData,
      },
    };
  }
}
