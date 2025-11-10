/**
 * Locations module - exports for locations object operations
 * Following the pattern established by deals module
 */

// Export main operations
export * from './attributes.js';
export * from './relationships.js';
export * from './notes.js';

// Search operations
export { advancedSearchLocations } from './search.js';

// Export attribute operations and field validation
export {
  isStandardLocationField,
  getStandardLocationFields,
  validateLocationFields,
  STANDARD_LOCATION_FIELDS,
  REQUIRED_LOCATION_FIELDS,
} from './attributes.js';

// Export relationship operations
export {
  getCompanyLocations,
  getLocationCompany,
  linkLocationToCompany,
  unlinkLocationFromCompany,
} from './relationships.js';

// Export notes operations
export {
  createLocationNote,
  getLocationNotes,
  updateLocationNote,
  deleteLocationNote,
} from './notes.js';
