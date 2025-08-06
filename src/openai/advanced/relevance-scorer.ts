/**
 * Relevance Scoring Algorithm for Search Results
 * Implements TF-IDF and other scoring mechanisms for better search ranking
 */

import { features } from '../../config/features.js';
import { 
  ScoringAlgorithm, 
  createScorer, 
  HybridScorer,
  BM25Scorer,
  TFIDFScorer,
  SemanticScorer 
} from './scoring-algorithms.js';

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
  private algorithm: ScoringAlgorithm = 'hybrid';
  private scorer: TFIDFScorer | BM25Scorer | SemanticScorer | HybridScorer;

  constructor(algorithm: ScoringAlgorithm = 'hybrid') {
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
    
    // Initialize scoring algorithm
    this.algorithm = algorithm;
    this.scorer = createScorer(algorithm);
  }

  /**
   * Score search results based on query and various factors
   */
  public scoreResults(
    results: SearchResult[],
    query: string,
    options?: {
      algorithm?: ScoringAlgorithm;
      updateCorpus?: boolean;
    }
  ): SearchResult[] {
    if (!features.isEnabled('enableRelevanceScoring')) {
      return results;
    }

    // Use specified algorithm or default
    const algorithm = options?.algorithm || this.algorithm;
    if (algorithm !== this.algorithm) {
      this.scorer = createScorer(algorithm);
      this.algorithm = algorithm;
    }

    // Update corpus statistics if requested
    if (options?.updateCorpus && results.length > 0) {
      const documents = results.map(r => this.extractTextFromData(r.data));
      if (this.scorer instanceof HybridScorer) {
        this.scorer.updateCorpus(documents);
      } else if (this.scorer instanceof BM25Scorer) {
        this.scorer.updateCorpusStatistics(documents);
      } else if (this.scorer instanceof TFIDFScorer) {
        this.scorer.updateDocumentFrequencies(documents);
      }
    }

    const queryTerms = this.tokenize(query.toLowerCase());
    
    const scoredResults = results.map(result => {
      // Calculate algorithm-based score
      const documentText = this.extractTextFromData(result.data);
      const algorithmScore = this.scorer.score(query, documentText);
      
      // Calculate traditional factors
      const factors = this.calculateFactors(result, queryTerms);
      
      // Combine algorithm score with other factors
      const combinedScore = this.combineScores(algorithmScore, factors);
      
      return {
        ...result,
        score: combinedScore,
        factors: {
          ...factors,
          algorithmScore,
        },
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
   * Extract text from data object for algorithm scoring
   */
  private extractTextFromData(data: any): string {
    if (!data) return '';
    
    const textParts: string[] = [];
    
    // Extract text from important fields
    for (const [field, weight] of this.fieldWeights.entries()) {
      const value = this.getFieldValue(data, field);
      if (value) {
        // Repeat text based on weight for better scoring
        const repetitions = Math.ceil(weight);
        for (let i = 0; i < repetitions; i++) {
          textParts.push(String(value));
        }
      }
    }
    
    return textParts.join(' ');
  }

  /**
   * Combine algorithm score with other factors
   */
  private combineScores(algorithmScore: number, factors: Partial<ScoringFactors>): number {
    // Weight algorithm score heavily (60%)
    const algorithmWeight = 0.6;
    const factorWeight = 0.4;
    
    // Calculate factor-based score
    const factorScore = this.calculateFinalScore(factors);
    
    // Combine scores
    return algorithmScore * algorithmWeight + factorScore * factorWeight;
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

  /**
   * Set scoring algorithm
   */
  public setAlgorithm(algorithm: ScoringAlgorithm): void {
    this.algorithm = algorithm;
    this.scorer = createScorer(algorithm);
  }

  /**
   * Get current algorithm
   */
  public getAlgorithm(): ScoringAlgorithm {
    return this.algorithm;
  }

  /**
   * Configure algorithm parameters
   */
  public configureAlgorithm(config: any): void {
    if (this.scorer instanceof BM25Scorer && config.k1 !== undefined) {
      this.scorer.setParameters(config.k1, config.b);
    } else if (this.scorer instanceof HybridScorer && config.weights) {
      this.scorer.setWeights(config.weights);
    }
  }
}

// Export singleton instance
export const relevanceScorer = new RelevanceScorer();