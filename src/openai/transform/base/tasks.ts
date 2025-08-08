/**
 * Transformer for task records (moved to transform/base)
 */

import {
  extractAttributeValue,
  generateRecordUrl,
} from '../../transformers/index.js';
import type { OpenAIFetchResult, OpenAISearchResult } from '../../types.js';

export const transformTask = {
  toSearchResult(task: any): OpenAISearchResult {
    const id = task.id?.task_id || task.id?.record_id || task.id;
    const attrs = task.values || task.attributes || {};
    const content = extractAttributeValue(
      task.content || attrs.name || attrs.content
    );
    const status = extractAttributeValue(task.status || attrs.status);
    const assignee = extractAttributeValue(
      task.assignee?.name || attrs.assignee
    );

    const textParts: string[] = [];
    if (status) textParts.push(`Status: ${status}`);
    if (assignee) textParts.push(`Assigned to: ${assignee}`);
    const dueDate = task.deadline_at || attrs.due_date;
    if (dueDate)
      textParts.push(`Due: ${new Date(dueDate).toLocaleDateString()}`);
    if (task.linked_records && task.linked_records.length > 0) {
      const linkedCount = task.linked_records.length;
      textParts.push(
        `${linkedCount} linked record${linkedCount > 1 ? 's' : ''}`
      );
    }

    return {
      id: `tasks:${id}`,
      title: content || 'Untitled Task',
      text: textParts.join('\n') || content || 'No details available',
      url: generateRecordUrl(id, 'tasks'),
    };
  },

  toFetchResult(task: any): OpenAIFetchResult {
    const searchResult = this.toSearchResult(task);
    const metadata: Record<string, any> = {};
    const attrs = task.values || task.attributes || {};

    if (attrs) {
      const valueFields = [
        'name',
        'status',
        'due_date',
        'assignee',
        'priority',
        'description',
      ];
      for (const field of valueFields) {
        if (attrs[field] !== undefined) {
          const value = extractAttributeValue(attrs[field]);
          if (value) metadata[field] = value;
        }
      }
    }

    if (task.status) metadata.status = task.status;
    if (task.is_completed !== undefined)
      metadata.is_completed = task.is_completed;
    if (task.completed_at) metadata.completed_at = task.completed_at;
    if (task.deadline_at) metadata.deadline_at = task.deadline_at;
    if (task.reminder_at) metadata.reminder_at = task.reminder_at;

    if (task.assignee) {
      metadata.assignee = {
        id: task.assignee.id,
        name: task.assignee.name,
        email: task.assignee.email,
      };
    }
    if (task.created_by) {
      metadata.created_by = {
        id: task.created_by.id,
        name: task.created_by.name,
        email: task.created_by.email,
      };
    }

    if (task.linked_records && Array.isArray(task.linked_records)) {
      metadata.linked_records = task.linked_records.map((record: any) => ({
        id: record.id,
        type: record.type,
        name: record.name,
        url: generateRecordUrl(record.id, record.type),
      }));
    }

    if (task.format) metadata.format = task.format;
    if (task.content_type) metadata.content_type = task.content_type;
    if (task.tags) metadata.tags = extractAttributeValue(task.tags);
    if (task.labels) metadata.labels = extractAttributeValue(task.labels);
    if (task.priority) metadata.priority = task.priority;
    if (task.comment_count !== undefined)
      metadata.comment_count = task.comment_count;
    if (task.last_activity_at)
      metadata.last_activity_at = task.last_activity_at;
    if (task.is_recurring) {
      metadata.is_recurring = task.is_recurring;
      if (task.recurrence_pattern)
        metadata.recurrence_pattern = task.recurrence_pattern;
    }
    if (task.created_at) metadata.created_at = task.created_at;
    if (task.updated_at) metadata.updated_at = task.updated_at;

    return {
      ...searchResult,
      data: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  },
};
