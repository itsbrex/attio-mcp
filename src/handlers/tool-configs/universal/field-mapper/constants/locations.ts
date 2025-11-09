/**
 * Locations field mappings and validation rules
 */

import { FieldMapping } from '../types.js';
import {
  createDisplayNameConstants,
  createPluralMappingConstants,
  validateFieldMappingConstants,
} from '../utils/field-mapping-constants.js';

// Display name constants for better maintainability
const DISPLAY_NAMES = createDisplayNameConstants({
  TENANT_NAME: 'tenant name',
  BUILDING_NAME: 'building name',
  STREET_ADDRESS: 'street address',
  FULL_ADDRESS: 'full address',
  SUITE: 'suite',
  CITY: 'city',
  STATE: 'state',
  ZIP_CODE: 'zip code',
  SQUARE_FEET: 'sf occupied',
  COMPANY: 'company',
  DECISION_MAKERS: 'people',
  LXD: 'lxd',
  SPACE_USE: 'space use',
});

// Plural to singular mapping pattern
const PLURAL_MAPPINGS = createPluralMappingConstants({
  companies: 'company',
  organizations: 'company',
  tenants: 'tenant_name',
  buildings: 'building_name',
  contacts: 'decision_makers',
  people: 'decision_makers',
  addresses: 'address',
  states: 'state',
  cities: 'city',
});

// Validate constants for consistency
const validation = validateFieldMappingConstants(
  DISPLAY_NAMES,
  PLURAL_MAPPINGS
);
if (!validation.valid) {
  console.warn('Field mapping constants validation issues:', validation.issues);
}

/**
 * Field mapping configuration for locations resource type
 */
export const LOCATIONS_FIELD_MAPPING: FieldMapping = {
  fieldMappings: {
    // Display names from discover-attributes
    [DISPLAY_NAMES.TENANT_NAME]: 'tenant_name',
    [DISPLAY_NAMES.BUILDING_NAME]: 'building_name',
    [DISPLAY_NAMES.STREET_ADDRESS]: 'street_address_1',
    [DISPLAY_NAMES.FULL_ADDRESS]: 'full_address',
    [DISPLAY_NAMES.SUITE]: 'suite',
    [DISPLAY_NAMES.CITY]: 'city',
    [DISPLAY_NAMES.STATE]: 'state',
    [DISPLAY_NAMES.ZIP_CODE]: 'zip_code',
    [DISPLAY_NAMES.SQUARE_FEET]: 'sf_occupied',
    [DISPLAY_NAMES.COMPANY]: 'company',
    [DISPLAY_NAMES.DECISION_MAKERS]: 'decision_makers',
    [DISPLAY_NAMES.LXD]: 'exp_date',
    [DISPLAY_NAMES.SPACE_USE]: 'space_use',

    // Address variations
    address: 'address',
    street: 'street_address_1',
    street_address: 'street_address_1',
    location_address: 'address',
    property_address: 'address',
    full_address: 'full_address',
    complete_address: 'full_address',

    // Building variations
    building: 'building_name',
    property: 'building_name',
    building_park: 'building_park',
    property_name: 'building_name',
    center_name: 'center_name',

    // Tenant variations
    tenant: 'tenant_name',
    occupant: 'tenant_name',
    lessee: 'tenant_name',
    renter: 'tenant_name',

    // Size variations
    size: 'sf_occupied',
    square_feet: 'sf_occupied',
    sf: 'sf_occupied',
    sqft: 'sf_occupied',
    sq_ft: 'sf_occupied',
    area: 'sf_occupied',

    // Location details
    floor: 'floor',
    suite: 'suite',
    unit: 'suite',
    room: 'suite',
    office: 'suite',

    // Geographic details
    city: 'city',
    town: 'city',
    municipality: 'city',
    state: 'state',
    province: 'state',
    region: 'state',
    county: 'county',
    zip: 'zip_code',
    postal_code: 'zip_code',
    zip_code: 'zip_code',
    postcode: 'zip_code',

    // Company/people associations
    ...PLURAL_MAPPINGS,
    decision_maker: 'decision_makers',
    contact: 'decision_makers',
    owner: 'landlord',
    landlord: 'landlord',
    property_owner: 'landlord',

    // Lease details
    lease_expiration: 'exp_date',
    expiration_date: 'exp_date',
    lxd: 'exp_date',
    lease_date: 'exp_date',
    commencement: 'commencement',
    commencement_date: 'commencement',
    move_in: 'move_in_date',
    move_in_date: 'move_in_date',
    moved_in: 'moved_in',

    // Type and use
    space_type: 'space_use',
    use: 'space_use',
    usage: 'space_use',
    property_type: 'property_type',
    location_type: 'location_type',
    occupancy_type: 'occupancy_type',
    rent_type: 'rent_type',

    // Market details
    market: 'market_2',
    submarket: 'submarket',

    // Industry/business
    industry: 'industry',
    naics: 'naics',
    sic: 'sic',

    // Contact info
    phone: 'location_phone',
    phone_number: 'location_phone',
    website: 'website',
    web: 'website',
    url: 'website',

    // Associated deals
    deals: 'associated_deals',
    associated_deal: 'associated_deals',
    associated_deals: 'associated_deals',

    // Metadata
    created_at: 'created_at',
    created_by: 'created_by',
    record_id: 'record_id',
    id: 'record_id',
  },
  requiredFields: ['tenant_name', 'address'],
  validFields: [
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
    'exp_date',
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
  ] as const,
  commonMistakes: {
    'tenant name':
      'Display name from discover-attributes. Maps to API field "tenant_name"',
    'building name':
      'Display name from discover-attributes. Maps to API field "building_name"',
    'street address':
      'Display name from discover-attributes. Maps to API field "street_address_1"',
    'full address':
      'Display name from discover-attributes. Maps to API field "full_address"',
    'sf occupied':
      'Display name from discover-attributes. Maps to API field "sf_occupied"',
    lxd: 'Lease expiration date. Maps to API field "exp_date"',
    people:
      'Display name from discover-attributes. Maps to API field "decision_makers"',
    'square feet': 'Maps to API field "sf_occupied"',
    'zip code':
      'Display name from discover-attributes. Maps to API field "zip_code"',
    'space use':
      'Display name from discover-attributes. Maps to API field "space_use"',
  },
};
