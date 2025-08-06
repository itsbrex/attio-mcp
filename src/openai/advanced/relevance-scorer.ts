/**
 * Relevance Scoring Algorithm for Search Results
 * Implements TF-IDF and other scoring mechanisms for better search ranking
 */

import { features } from '../../config/features.js';

export interface ScoringFactors {
  textMatch: number; // 0-1 score for text similarity
  fieldWeights: Map<string, number>; // Weights for different fields
  recency: number; // 0-1 score based on last update time
  completeness: number; // 0-1 score based on field completeness
  engagement: number; // 0-1 score based on interaction history
}

export interface SearchResult {
  id: string;
  data: any;
  score?: number;
  factors?: Partial<ScoringFactors>;
}

/**
 * Advanced relevance scoring system
 */
export class RelevanceScorer {
  private fieldWeights: Map<string, number>;
  private defaultWeights: {
    textMatch: number;
    recency: number;
    completeness: number;
    engagement: number;
  };

  constructor() {
    // Default field importance weights
    this.fieldWeights = new Map([
      ['name', 1.0],
      ['title', 0.9],
      ['description', 0.7],
      ['notes', 0.5],
      ['tags', 0.6],
      ['email', 0.8],
      ['phone', 0.6],
      ['company', 0.7],
    ]);

    // Default factor weights
    this.defaultWeights = {
      textMatch: 0.4,
      recency: 0.2,
      completeness: 0.2,
      engagement: 0.2,
    };
  }

  /**
   * Score search results based on query and various factors
   */
  public scoreResults(
    results: SearchResult[],
    query: string
  ): SearchResult[] {
    if (!features.isEnabled('enableRelevanceScoring')) {
      return results;
    }

    const queryTerms = this.tokenize(query.toLowerCase());
    
    const scoredResults = results.map(result => {
      const factors = this.calculateFactors(result, queryTerms);
      const score = this.calculateFinalScore(factors);
      
      return {
        ...result,
        score,
        factors,
      };
    });

    // Sort by score (highest first)
    return scoredResults.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Calculate scoring factors for a result
   */
  private calculateFactors(
    result: SearchResult,
    queryTerms: string[]
  ): Partial<ScoringFactors> {
    const factors: Partial<ScoringFactors> = {};

    // Text match score
    factors.textMatch = this.calculateTextMatchScore(result.data, queryTerms);

    // Recency score (if timestamp available)
    if (result.data.updated_at || result.data.created_at) {
      factors.recency = this.calculateRecencyScore(
        result.data.updated_at || result.data.created_at
      );
    }

    // Completeness score
    factors.completeness = this.calculateCompletenessScore(result.data);

    // Engagement score (placeholder for future implementation)
    factors.engagement = 0.5; // Default neutral score

    return factors;
  }

  /**
   * Calculate text match score using TF-IDF-like approach
   */
  private calculateTextMatchScore(
    data: any,
    queryTerms: string[]
  ): number {
    if (!data || queryTerms.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let fieldCount = 0;

    // Score each field
    for (const [field, weight] of this.fieldWeights.entries()) {
      const fieldValue = this.getFieldValue(data, field);
      if (!fieldValue) continue;

      const fieldText = String(fieldValue).toLowerCase();
      const fieldTerms = this.tokenize(fieldText);
      
      // Calculate term frequency
      let matchCount = 0;
      for (const queryTerm of queryTerms) {
        for (const fieldTerm of fieldTerms) {
          if (fieldTerm.includes(queryTerm) || queryTerm.includes(fieldTerm)) {
            matchCount++;
          }
        }
      }

      if (matchCount > 0) {
        const termFrequency = matchCount / Math.max(queryTerms.length, fieldTerms.length);
        totalScore += termFrequency * weight;
        fieldCount++;
      }
    }

    return fieldCount > 0 ? totalScore / fieldCount : 0;
  }

  /**
   * Calculate recency score based on timestamp
   */
  private calculateRecencyScore(timestamp: string | Date): number {
    const date = new Date(timestamp);
    const now = new Date();
    const daysSince = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

    // Scoring curve: recent items score higher
    if (daysSince <= 1) return 1.0;
    if (daysSince <= 7) return 0.9;
    if (daysSince <= 30) return 0.7;
    if (daysSince <= 90) return 0.5;
    if (daysSince <= 365) return 0.3;
    return 0.1;
  }

  /**
   * Calculate completeness score based on filled fields
   */
  private calculateCompletenessScore(data: any): number {
    if (!data) return 0;

    const importantFields = [
      'name', 'email', 'phone', 'company',
      'title', 'description', 'website',
    ];

    let filledCount = 0;
    for (const field of importantFields) {
      const value = this.getFieldValue(data, field);
      if (value && String(value).trim().length > 0) {
        filledCount++;
      }
    }

    return filledCount / importantFields.length;
  }

  /**
   * Calculate final score from all factors
   */
  private calculateFinalScore(factors: Partial<ScoringFactors>): number {
    let score = 0;
    let weightSum = 0;

    if (factors.textMatch !== undefined) {
      score += factors.textMatch * this.defaultWeights.textMatch;
      weightSum += this.defaultWeights.textMatch;
    }

    if (factors.recency !== undefined) {
      score += factors.recency * this.defaultWeights.recency;
      weightSum += this.defaultWeights.recency;
    }

    if (factors.completeness !== undefined) {
      score += factors.completeness * this.defaultWeights.completeness;
      weightSum += this.defaultWeights.completeness;
    }

    if (factors.engagement !== undefined) {
      score += factors.engagement * this.defaultWeights.engagement;
      weightSum += this.defaultWeights.engagement;
    }

    return weightSum > 0 ? score / weightSum : 0;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 1);
  }

  /**
   * Get nested field value from object
   */
  private getFieldValue(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Update field weights
   */
  public updateFieldWeights(weights: Record<string, number>): void {
    for (const [field, weight] of Object.entries(weights)) {
      this.fieldWeights.set(field, weight);
    }
  }

  /**
   * Update factor weights
   */
  public updateFactorWeights(weights: Partial<typeof this.defaultWeights>): void {
    this.defaultWeights = { ...this.defaultWeights, ...weights };
  }
}

// Export singleton instance
export const relevanceScorer = new RelevanceScorer();