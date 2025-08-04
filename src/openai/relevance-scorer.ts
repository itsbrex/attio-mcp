/**
 * OpenAI Relevance Scorer
 * Calculates relevance scores for search results to improve ranking
 */

import { OpenAISearchResult, SearchRelevanceScore } from '../types/openai-types.js';
import { IOpenAIRelevanceScorer } from './interfaces.js';

/**
 * Default implementation of relevance scorer
 */
export class OpenAIRelevanceScorer implements IOpenAIRelevanceScorer {
  /**
   * Calculate relevance score for a search result
   */
  async calculateRelevance(
    record: any,
    query: string,
    objectType: string
  ): Promise<number> {
    const textMatch = this.calculateTextMatchScore(record, query);
    const recency = this.calculateRecencyScore(record);
    const frequency = this.calculateFrequencyScore(record);
    const completeness = this.calculateCompletenessScore(record, objectType);

    // Weighted combination of factors
    const weights = {
      textMatch: 0.4,
      recency: 0.2,
      frequency: 0.2,
      completeness: 0.2,
    };

    const overallScore =
      textMatch * weights.textMatch +
      recency * weights.recency +
      frequency * weights.frequency +
      completeness * weights.completeness;

    return Math.max(0, Math.min(1, overallScore));
  }

  /**
   * Rank search results by relevance
   */
  async rankResults(
    results: OpenAISearchResult[],
    query: string
  ): Promise<OpenAISearchResult[]> {
    // Calculate relevance for each result
    const scoredResults = [];

    for (const result of results) {
      const relevance = await this.calculateRelevance(result, query, 'generic');
      scoredResults.push({ result, relevance });
    }

    // Sort by relevance score (highest first)
    scoredResults.sort((a, b) => b.relevance - a.relevance);

    return scoredResults.map(item => item.result);
  }

  /**
   * Calculate text matching score based on how well the record matches the query
   */
  private calculateTextMatchScore(record: any, query: string): number {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0);

    if (queryTerms.length === 0) return 0;

    // Get searchable text from the record
    const searchableText = this.getSearchableText(record).toLowerCase();
    
    if (searchableText.length === 0) return 0;

    let totalScore = 0;
    let matchedTerms = 0;

    for (const term of queryTerms) {
      const termScore = this.calculateTermScore(searchableText, term);
      if (termScore > 0) {
        matchedTerms++;
        totalScore += termScore;
      }
    }

    // If no terms matched, return 0
    if (matchedTerms === 0) return 0;

    // Average term score, with bonus for matching more terms
    const averageScore = totalScore / queryTerms.length;
    const coverageBonus = matchedTerms / queryTerms.length;
    
    return averageScore * 0.7 + coverageBonus * 0.3;
  }

  /**
   * Calculate score for a single term within text
   */
  private calculateTermScore(text: string, term: string): number {
    // Exact match gets highest score
    if (text.includes(term)) {
      // Position bonus: earlier matches score higher
      const firstIndex = text.indexOf(term);
      const positionScore = Math.max(0, 1 - (firstIndex / text.length));
      
      // Frequency bonus: more occurrences score higher
      const occurrences = (text.match(new RegExp(term, 'g')) || []).length;
      const frequencyScore = Math.min(1, occurrences / 5); // Cap at 5 occurrences
      
      return 0.6 + positionScore * 0.2 + frequencyScore * 0.2;
    }

    // Partial matching for longer terms
    if (term.length >= 4) {
      // Check for substring matches
      for (let i = 0; i < text.length - term.length + 1; i++) {
        const substring = text.substr(i, term.length);
        const similarity = this.calculateStringSimilarity(substring, term);
        if (similarity > 0.8) {
          return similarity * 0.5; // Partial match gets reduced score
        }
      }

      // Check for word-boundary matches
      const words = text.split(/\s+/);
      for (const word of words) {
        const similarity = this.calculateStringSimilarity(word, term);
        if (similarity > 0.7) {
          return similarity * 0.6;
        }
      }
    }

    return 0;
  }

  /**
   * Calculate string similarity using simple character matching
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    const editDistance = this.calculateEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate edit distance (Levenshtein distance) between two strings
   */
  private calculateEditDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate recency score based on when the record was last updated
   */
  private calculateRecencyScore(record: any): number {
    const updatedAt = this.extractDate(
      record.values?.updated_at?.value ||
      record.values?.last_interaction?.value ||
      record.updated_at
    );

    if (!updatedAt) return 0.5; // Default score if no date available

    const now = new Date();
    const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Exponential decay: more recent = higher score
    if (daysSinceUpdate <= 1) return 1.0;
    if (daysSinceUpdate <= 7) return 0.9;
    if (daysSinceUpdate <= 30) return 0.7;
    if (daysSinceUpdate <= 90) return 0.5;
    if (daysSinceUpdate <= 365) return 0.3;
    
    return 0.1;
  }

  /**
   * Calculate frequency score based on interaction frequency
   */
  private calculateFrequencyScore(record: any): number {
    // Check for interaction indicators
    const hasRecentInteraction = !!(
      record.values?.last_interaction?.value ||
      record.values?.last_contacted?.value ||
      record.values?.interaction_count?.value
    );

    if (hasRecentInteraction) {
      const interactionCount = parseInt(record.values?.interaction_count?.value) || 1;
      return Math.min(1, interactionCount / 10); // Normalize to 0-1, cap at 10 interactions
    }

    return 0.5; // Default score
  }

  /**
   * Calculate completeness score based on how much data the record has
   */
  private calculateCompletenessScore(record: any, objectType: string): number {
    if (!record.values) return 0.1;

    const values = record.values;
    let totalFields = 0;
    let filledFields = 0;

    // Define important fields by object type
    const importantFields = this.getImportantFields(objectType);

    for (const field of importantFields) {
      totalFields++;
      if (values[field] && this.hasValue(values[field])) {
        filledFields++;
      }
    }

    if (totalFields === 0) return 0.5;

    return filledFields / totalFields;
  }

  /**
   * Get important fields for completeness scoring by object type
   */
  private getImportantFields(objectType: string): string[] {
    switch (objectType.toLowerCase()) {
      case 'people':
      case 'person':
        return ['name', 'first_name', 'last_name', 'email_addresses', 'phone_numbers', 'job_title', 'company'];
      
      case 'companies':
      case 'company':
        return ['name', 'domain', 'industry', 'location', 'description'];
      
      case 'lists':
      case 'list':
        return ['name', 'description'];
      
      case 'tasks':
      case 'task':
        return ['title', 'description', 'status', 'due_date'];
      
      default:
        return ['name', 'title', 'description'];
    }
  }

  /**
   * Check if a field has a meaningful value
   */
  private hasValue(field: any): boolean {
    if (!field) return false;
    
    if (field.value === null || field.value === undefined) return false;
    
    if (typeof field.value === 'string') {
      return field.value.trim().length > 0;
    }
    
    if (Array.isArray(field.value)) {
      return field.value.length > 0 && field.value.some(item => 
        item && (typeof item === 'string' ? item.trim().length > 0 : true)
      );
    }
    
    return true;
  }

  /**
   * Get searchable text from a record
   */
  private getSearchableText(record: any): string {
    const parts: string[] = [];
    
    if (!record.values) return '';

    // Extract text from common fields
    const textFields = ['name', 'title', 'description', 'notes'];
    for (const field of textFields) {
      if (record.values[field] && this.hasValue(record.values[field])) {
        parts.push(String(record.values[field].value));
      }
    }

    // Extract text from array fields (like email addresses)
    const arrayFields = ['email_addresses', 'phone_numbers'];
    for (const field of arrayFields) {
      if (record.values[field] && Array.isArray(record.values[field].value)) {
        const arrayValues = record.values[field].value
          .map((item: any) => typeof item === 'string' ? item : (item.value || String(item)))
          .filter(Boolean);
        parts.push(...arrayValues);
      }
    }

    return parts.join(' ');
  }

  /**
   * Extract date from various formats
   */
  private extractDate(dateValue: any): Date | null {
    if (!dateValue) return null;

    if (dateValue instanceof Date) return dateValue;
    
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    
    if (typeof dateValue === 'number') {
      return new Date(dateValue);
    }

    return null;
  }
}