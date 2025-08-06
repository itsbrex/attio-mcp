/**
 * Advanced Scoring Algorithms for Relevance Ranking
 * Implements TF-IDF, BM25, and Semantic Similarity scoring
 */

import { features } from '../../config/features.js';

export type ScoringAlgorithm = 'tfidf' | 'bm25' | 'semantic' | 'hybrid';

/**
 * TF-IDF (Term Frequency-Inverse Document Frequency) implementation
 */
export class TFIDFScorer {
  private documentFrequencies: Map<string, number> = new Map();
  private totalDocuments: number = 0;
  
  /**
   * Calculate TF-IDF score for a query against a document
   */
  public score(query: string, document: string): number {
    const queryTerms = this.tokenize(query);
    const docTerms = this.tokenize(document);
    
    if (queryTerms.length === 0 || docTerms.length === 0) {
      return 0;
    }
    
    // Calculate term frequencies
    const docTermFreq = this.calculateTermFrequency(docTerms);
    
    let score = 0;
    for (const term of queryTerms) {
      const tf = docTermFreq.get(term) || 0;
      const idf = this.calculateIDF(term);
      score += tf * idf;
    }
    
    // Normalize by document length
    return score / Math.sqrt(docTerms.length);
  }
  
  /**
   * Update document frequencies for IDF calculation
   */
  public updateDocumentFrequencies(documents: string[]): void {
    this.totalDocuments = documents.length;
    this.documentFrequencies.clear();
    
    for (const doc of documents) {
      const terms = new Set(this.tokenize(doc));
      for (const term of terms) {
        const count = this.documentFrequencies.get(term) || 0;
        this.documentFrequencies.set(term, count + 1);
      }
    }
  }
  
  private calculateTermFrequency(terms: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const term of terms) {
      freq.set(term, (freq.get(term) || 0) + 1);
    }
    
    // Normalize frequencies
    const maxFreq = Math.max(...freq.values());
    for (const [term, count] of freq.entries()) {
      freq.set(term, count / maxFreq);
    }
    
    return freq;
  }
  
  private calculateIDF(term: string): number {
    const docFreq = this.documentFrequencies.get(term) || 0;
    if (docFreq === 0 || this.totalDocuments === 0) {
      return 0;
    }
    return Math.log((this.totalDocuments + 1) / (docFreq + 1));
  }
  
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 1);
  }
}

/**
 * BM25 (Best Matching 25) implementation
 * More sophisticated than TF-IDF, commonly used in search engines
 */
export class BM25Scorer {
  private k1: number = 1.2; // Term frequency saturation parameter
  private b: number = 0.75; // Length normalization parameter
  private avgDocLength: number = 0;
  private documentFrequencies: Map<string, number> = new Map();
  private totalDocuments: number = 0;
  
  /**
   * Calculate BM25 score for a query against a document
   */
  public score(query: string, document: string): number {
    const queryTerms = this.tokenize(query);
    const docTerms = this.tokenize(document);
    
    if (queryTerms.length === 0 || docTerms.length === 0) {
      return 0;
    }
    
    const docLength = docTerms.length;
    const termFreq = this.calculateTermFrequency(docTerms);
    
    let score = 0;
    for (const term of queryTerms) {
      const tf = termFreq.get(term) || 0;
      const idf = this.calculateIDF(term);
      
      // BM25 formula
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
      
      score += idf * (numerator / denominator);
    }
    
    return score;
  }
  
  /**
   * Update corpus statistics for BM25 calculation
   */
  public updateCorpusStatistics(documents: string[]): void {
    this.totalDocuments = documents.length;
    this.documentFrequencies.clear();
    
    let totalLength = 0;
    for (const doc of documents) {
      const terms = this.tokenize(doc);
      totalLength += terms.length;
      
      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        const count = this.documentFrequencies.get(term) || 0;
        this.documentFrequencies.set(term, count + 1);
      }
    }
    
    this.avgDocLength = totalLength / documents.length;
  }
  
  private calculateTermFrequency(terms: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const term of terms) {
      freq.set(term, (freq.get(term) || 0) + 1);
    }
    return freq;
  }
  
  private calculateIDF(term: string): number {
    const docFreq = this.documentFrequencies.get(term) || 0;
    if (docFreq === 0 || this.totalDocuments === 0) {
      return 0;
    }
    
    // BM25 IDF formula
    const numerator = this.totalDocuments - docFreq + 0.5;
    const denominator = docFreq + 0.5;
    return Math.log(numerator / denominator);
  }
  
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 1);
  }
  
  /**
   * Set BM25 parameters
   */
  public setParameters(k1?: number, b?: number): void {
    if (k1 !== undefined) this.k1 = k1;
    if (b !== undefined) this.b = b;
  }
}

/**
 * Semantic Similarity Scorer
 * Uses word embeddings and vector similarity for semantic matching
 */
export class SemanticScorer {
  private wordVectors: Map<string, number[]> = new Map();
  private vectorDimension: number = 50;
  
  /**
   * Calculate semantic similarity score between query and document
   */
  public score(query: string, document: string): number {
    const queryVector = this.getTextVector(query);
    const docVector = this.getTextVector(document);
    
    if (!queryVector || !docVector) {
      return 0;
    }
    
    // Calculate cosine similarity
    return this.cosineSimilarity(queryVector, docVector);
  }
  
  /**
   * Get vector representation of text
   */
  private getTextVector(text: string): number[] | null {
    const terms = this.tokenize(text);
    if (terms.length === 0) return null;
    
    const vector = new Array(this.vectorDimension).fill(0);
    let validTerms = 0;
    
    for (const term of terms) {
      const termVector = this.getWordVector(term);
      if (termVector) {
        for (let i = 0; i < this.vectorDimension; i++) {
          vector[i] += termVector[i];
        }
        validTerms++;
      }
    }
    
    if (validTerms === 0) return null;
    
    // Average the vectors
    for (let i = 0; i < this.vectorDimension; i++) {
      vector[i] /= validTerms;
    }
    
    return vector;
  }
  
  /**
   * Get or generate word vector (simplified - in production would use pre-trained embeddings)
   */
  private getWordVector(word: string): number[] {
    if (!this.wordVectors.has(word)) {
      // Generate pseudo-random vector based on word hash
      // In production, this would load from pre-trained embeddings
      const vector = new Array(this.vectorDimension);
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
        hash = hash & hash;
      }
      
      for (let i = 0; i < this.vectorDimension; i++) {
        // Generate deterministic pseudo-random values
        hash = ((hash * 1103515245 + 12345) / 65536) % 32768;
        vector[i] = (hash / 32768) * 2 - 1; // Normalize to [-1, 1]
      }
      
      this.wordVectors.set(word, vector);
    }
    
    return this.wordVectors.get(word)!;
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) return 0;
    
    // Normalize to [0, 1] range
    return (dotProduct / denominator + 1) / 2;
  }
  
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 1);
  }
}

/**
 * Hybrid Scorer combining multiple algorithms
 */
export class HybridScorer {
  private tfidf: TFIDFScorer;
  private bm25: BM25Scorer;
  private semantic: SemanticScorer;
  private weights: {
    tfidf: number;
    bm25: number;
    semantic: number;
  };
  
  constructor() {
    this.tfidf = new TFIDFScorer();
    this.bm25 = new BM25Scorer();
    this.semantic = new SemanticScorer();
    
    // Default weights for hybrid scoring
    this.weights = {
      tfidf: 0.3,
      bm25: 0.5,
      semantic: 0.2,
    };
  }
  
  /**
   * Calculate hybrid score combining all algorithms
   */
  public score(query: string, document: string): number {
    const tfidfScore = this.tfidf.score(query, document);
    const bm25Score = this.bm25.score(query, document);
    const semanticScore = this.semantic.score(query, document);
    
    return (
      tfidfScore * this.weights.tfidf +
      bm25Score * this.weights.bm25 +
      semanticScore * this.weights.semantic
    );
  }
  
  /**
   * Update corpus statistics for all algorithms
   */
  public updateCorpus(documents: string[]): void {
    this.tfidf.updateDocumentFrequencies(documents);
    this.bm25.updateCorpusStatistics(documents);
  }
  
  /**
   * Set weights for hybrid scoring
   */
  public setWeights(weights: Partial<typeof this.weights>): void {
    this.weights = { ...this.weights, ...weights };
    
    // Normalize weights to sum to 1
    const sum = this.weights.tfidf + this.weights.bm25 + this.weights.semantic;
    if (sum > 0) {
      this.weights.tfidf /= sum;
      this.weights.bm25 /= sum;
      this.weights.semantic /= sum;
    }
  }
}

/**
 * Factory function to create scorer based on algorithm type
 */
export function createScorer(algorithm: ScoringAlgorithm): TFIDFScorer | BM25Scorer | SemanticScorer | HybridScorer {
  switch (algorithm) {
    case 'tfidf':
      return new TFIDFScorer();
    case 'bm25':
      return new BM25Scorer();
    case 'semantic':
      return new SemanticScorer();
    case 'hybrid':
    default:
      return new HybridScorer();
  }
}