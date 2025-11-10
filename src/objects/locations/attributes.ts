/**
 * Location attributes module
 * Provides field validation and standard field definitions for locations
 */

import { ValidationService } from '../../services/ValidationService.js';
import { UniversalResourceType } from '../../handlers/tool-configs/universal/types.js';

/**
 * Standard fields for locations based on discovered attributes
 * These are the most commonly used fields in the locations object
 */
export const STANDARD_LOCATION_FIELDS = [
  'tenant_name',
  'building_name',
  'address',
  'street_address_1',
  'full_address',
  'suite',
  'city',
  'state',
  'zip_code',
  'county',
  'sf_occupied',
  'company',
  'decision_makers',
  'exp_date', // LXD (Lease Expiration Date)
  'space_use',
  'floor',
  'landlord',
  'property_type',
  'location_type',
  'occupancy_type',
  'moved_in',
  'move_in_date',
  'commencement',
  'market_2',
  'submarket',
  'industry',
  'naics',
  'sic',
  'location_phone',
  'website',
  'associated_deals',
  'created_at',
  'created_by',
  'record_id',
] as const;

/**
 * Required fields for creating a location
 * Based on the field mapping configuration
 */
export const REQUIRED_LOCATION_FIELDS = ['tenant_name', 'address'] as const;

/**
 * Type for standard location fields
 */
export type StandardLocationField = (typeof STANDARD_LOCATION_FIELDS)[number];

/**
 * Type for required location fields
 */
export type RequiredLocationField = (typeof REQUIRED_LOCATION_FIELDS)[number];

/**
 * Check if a field is a standard location field
 */
export function isStandardLocationField(field: string): boolean {
  return STANDARD_LOCATION_FIELDS.includes(field as StandardLocationField);
}

/**
 * Get list of standard location fields
 */
export function getStandardLocationFields(): readonly string[] {
  return STANDARD_LOCATION_FIELDS;
}

/**
 * Validate location fields for creation or update
 * @param fields - Object containing field values
 * @param isUpdate - Whether this is an update operation (relaxed validation)
 * @returns Validation result with sanitized fields
 */
export function validateLocationFields(
  fields: Record<string, unknown>,
  isUpdate = false
): {
  valid: boolean;
  errors: string[];
  sanitizedFields: Record<string, unknown>;
} {
  const errors: string[] = [];
  const sanitizedFields: Record<string, unknown> = {};

  // Check required fields for creation
  if (!isUpdate) {
    for (const requiredField of REQUIRED_LOCATION_FIELDS) {
      if (!fields[requiredField]) {
        errors.push(`Missing required field: ${requiredField}`);
      }
    }
  }

  // Validate and sanitize each field
  for (const [key, value] of Object.entries(fields)) {
    // Skip null/undefined values
    if (value === null || value === undefined) {
      continue;
    }

    // Special validation for specific fields
    switch (key) {
      case 'tenant_name':
      case 'building_name':
      case 'address':
      case 'street_address_1':
      case 'full_address':
      case 'suite':
      case 'city':
      case 'state':
      case 'county':
      case 'space_use':
      case 'landlord':
      case 'property_type':
      case 'location_type':
      case 'occupancy_type':
      case 'market_2':
      case 'submarket':
      case 'industry':
        // Text fields
        if (typeof value !== 'string') {
          errors.push(`Field ${key} must be a string`);
        } else {
          sanitizedFields[key] = value.trim();
        }
        break;

      case 'zip_code':
        // Postal code validation
        if (typeof value !== 'string') {
          errors.push(`Field ${key} must be a string`);
        } else {
          // Allow various postal code formats
          const zipCode = value.toString().trim();
          if (!/^[A-Z0-9\s-]{3,10}$/i.test(zipCode)) {
            errors.push(`Invalid zip code format: ${zipCode}`);
          } else {
            sanitizedFields[key] = zipCode;
          }
        }
        break;

      case 'sf_occupied':
      case 'floor':
        // Numeric fields
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push(`Field ${key} must be a number`);
        } else {
          sanitizedFields[key] = Number(value);
        }
        break;

      case 'exp_date':
      case 'moved_in':
      case 'move_in_date':
      case 'commencement':
        // Date fields
        if (typeof value === 'string' || value instanceof Date) {
          const dateStr = value instanceof Date ? value.toISOString() : value;
          // Basic date format validation
          if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            errors.push(`Field ${key} must be in ISO date format (YYYY-MM-DD)`);
          } else {
            sanitizedFields[key] = dateStr;
          }
        } else {
          errors.push(`Field ${key} must be a date string or Date object`);
        }
        break;

      case 'company':
      case 'decision_makers':
      case 'associated_deals':
        // Reference fields (can be ID or object)
        if (typeof value === 'string') {
          // Validate as UUID if it looks like one
          if (value.includes('-')) {
            try {
              ValidationService.validateUUID(
                value,
                UniversalResourceType.LOCATIONS,
                'CREATE'
              );
            } catch {
              errors.push(`Field ${key} contains invalid UUID: ${value}`);
            }
          } else {
            sanitizedFields[key] = value;
          }
        } else if (Array.isArray(value)) {
          // Arrays of references
          sanitizedFields[key] = value;
        } else if (typeof value === 'object') {
          // Object references
          sanitizedFields[key] = value;
        } else {
          errors.push(`Field ${key} must be a string, array, or object`);
        }
        break;

      case 'location_phone':
        // Phone number validation
        if (typeof value !== 'string') {
          errors.push(`Field ${key} must be a string`);
        } else {
          // Basic phone number format - allow flexibility for international
          const phone = value.toString().trim();
          if (phone.length < 7 || phone.length > 20) {
            errors.push(`Invalid phone number length: ${phone}`);
          } else {
            sanitizedFields[key] = phone;
          }
        }
        break;

      case 'website':
        // URL validation
        if (typeof value !== 'string') {
          errors.push(`Field ${key} must be a string`);
        } else {
          const url = value.toString().trim();
          // Basic URL validation - allow with or without protocol
          if (
            url &&
            !url.match(/^(https?:\/\/)?([\w.-]+)(\.[\w]{2,})(\/.*)?$/i)
          ) {
            errors.push(`Invalid website URL: ${url}`);
          } else {
            sanitizedFields[key] = url;
          }
        }
        break;

      case 'naics':
      case 'sic':
        // Industry code validation
        if (typeof value !== 'string' && typeof value !== 'number') {
          errors.push(`Field ${key} must be a string or number`);
        } else {
          sanitizedFields[key] = value.toString();
        }
        break;

      default:
        // For any other fields, pass them through
        sanitizedFields[key] = value;
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedFields,
  };
}
