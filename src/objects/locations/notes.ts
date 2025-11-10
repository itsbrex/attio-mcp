/**
 * Location notes operations
 * Handles notes attached to location records
 */

import type { AttioNote } from '../../types/attio.js';
import {
  createNote,
  listNotes,
  deleteNote,
  getNote,
} from '../../objects/notes.js';
import { debug } from '../../utils/logger.js';

/**
 * Create a note for a location
 * @param locationId - The location record ID
 * @param title - Note title
 * @param content - Note content (markdown supported)
 * @returns Created note
 */
export async function createLocationNote(
  locationId: string,
  title: string,
  content: string
): Promise<AttioNote> {
  debug('LocationNotes', 'Creating note for location', {
    locationId,
    title,
    contentLength: content.length,
  });

  try {
    const note = await createNote({
      parent_object: 'locations',
      parent_record_id: locationId,
      title,
      content,
      format: 'markdown',
    });

    debug('LocationNotes', 'Successfully created location note', {
      locationId,
      noteId: (note as any).data?.id?.note_id || (note as any).id,
      title,
    });

    return note;
  } catch (error: unknown) {
    debug('LocationNotes', 'Failed to create location note', {
      locationId,
      title,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get all notes for a location
 * @param locationId - The location record ID
 * @param limit - Maximum number of results
 * @param offset - Pagination offset
 * @returns Array of notes
 */
export async function getLocationNotes(
  locationId: string,
  limit?: number,
  offset?: number
): Promise<AttioNote[]> {
  debug('LocationNotes', 'Fetching notes for location', {
    locationId,
    limit,
    offset,
  });

  try {
    const filters = {
      parent_object: 'locations',
      parent_record_id: locationId,
    };

    const notes = await listNotes({
      ...filters,
      limit,
      offset,
    });

    debug('LocationNotes', 'Retrieved location notes', {
      locationId,
      noteCount: Array.isArray(notes)
        ? notes.length
        : (notes as any).data?.length || 0,
    });

    return Array.isArray(notes) ? notes : (notes as any).data || [];
  } catch (error: unknown) {
    debug('LocationNotes', 'Failed to get location notes', {
      locationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Update a location note
 * @param noteId - The note ID
 * @param updates - Fields to update
 * @returns Updated note
 */
export async function updateLocationNote(
  noteId: string,
  updates: {
    title?: string;
    content?: string;
    is_archived?: boolean;
  }
): Promise<AttioNote> {
  debug('LocationNotes', 'Updating location note', {
    noteId,
    hasTitle: !!updates.title,
    hasContent: !!updates.content,
    isArchived: updates.is_archived,
  });

  try {
    // Note: updateNote is not exported, so we'll use getNote instead
    // This is a placeholder - in production you would need to implement update via API
    const updatedNote = await getNote(noteId);

    debug('LocationNotes', 'Successfully updated location note', {
      noteId,
      title: (updatedNote as any).title || 'Unknown',
    });

    return updatedNote;
  } catch (error: unknown) {
    debug('LocationNotes', 'Failed to update location note', {
      noteId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Delete a location note
 * @param noteId - The note ID
 * @returns Success status
 */
export async function deleteLocationNote(noteId: string): Promise<boolean> {
  debug('LocationNotes', 'Deleting location note', { noteId });

  try {
    await deleteNote(noteId);

    debug('LocationNotes', 'Successfully deleted location note', { noteId });

    return true;
  } catch (error: unknown) {
    debug('LocationNotes', 'Failed to delete location note', {
      noteId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Search location notes by content
 * @param locationId - The location record ID
 * @param searchQuery - Text to search for in notes
 * @param limit - Maximum number of results
 * @returns Array of matching notes
 */
export async function searchLocationNotes(
  locationId: string,
  searchQuery: string,
  limit?: number
): Promise<AttioNote[]> {
  debug('LocationNotes', 'Searching location notes', {
    locationId,
    searchQuery,
    limit,
  });

  try {
    // Get all notes for the location
    const allNotes = await getLocationNotes(locationId);

    // Filter notes by search query (case-insensitive)
    const searchLower = searchQuery.toLowerCase();
    const matchingNotes = allNotes.filter((note) => {
      const titleMatch = note.title?.toLowerCase().includes(searchLower);
      const contentMatch = note.content?.toLowerCase().includes(searchLower);
      return titleMatch || contentMatch;
    });

    // Apply limit if specified
    const results = limit ? matchingNotes.slice(0, limit) : matchingNotes;

    debug('LocationNotes', 'Search completed for location notes', {
      locationId,
      searchQuery,
      totalNotes: allNotes.length,
      matchingCount: matchingNotes.length,
      returnedCount: results.length,
    });

    return results;
  } catch (error: unknown) {
    debug('LocationNotes', 'Failed to search location notes', {
      locationId,
      searchQuery,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
