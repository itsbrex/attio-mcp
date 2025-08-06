/**
 * Tests for advanced scoring algorithms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TFIDFScorer,
  BM25Scorer,
  SemanticScorer,
  HybridScorer,
  createScorer,
} from '../../src/openai/advanced/scoring-algorithms.js';

describe('Scoring Algorithms', () => {
  describe('TF-IDF Scorer', () => {
    let scorer: TFIDFScorer;

    beforeEach(() => {
      scorer = new TFIDFScorer();
    });

    it('should calculate TF-IDF score for matching terms', () => {
      const query = 'artificial intelligence';
      const doc1 = 'artificial intelligence is transforming technology';
      const doc2 = 'machine learning and deep learning are important';
      const doc3 = 'artificial intelligence and machine learning are related';

      // Update document frequencies
      scorer.updateDocumentFrequencies([doc1, doc2, doc3]);

      const score1 = scorer.score(query, doc1);
      const score2 = scorer.score(query, doc2);
      const score3 = scorer.score(query, doc3);

      // Doc1 and doc3 should score higher than doc2
      expect(score1).toBeGreaterThan(score2);
      expect(score3).toBeGreaterThan(score2);

      // Doc1 should score highest (exact match)
      expect(score1).toBeGreaterThan(0);
    });

    it('should return 0 for non-matching documents', () => {
      const query = 'quantum computing';
      const document = 'traditional software development practices';

      scorer.updateDocumentFrequencies([document]);
      const score = scorer.score(query, document);

      expect(score).toBe(0);
    });

    it('should handle empty queries and documents', () => {
      expect(scorer.score('', 'test document')).toBe(0);
      expect(scorer.score('test query', '')).toBe(0);
      expect(scorer.score('', '')).toBe(0);
    });
  });

  describe('BM25 Scorer', () => {
    let scorer: BM25Scorer;

    beforeEach(() => {
      scorer = new BM25Scorer();
    });

    it('should calculate BM25 score with term frequency saturation', () => {
      const query = 'information retrieval';
      const doc1 =
        'information retrieval systems use information retrieval techniques';
      const doc2 = 'database systems store information';
      const doc3 = 'retrieval of data from databases';

      // Update corpus statistics
      scorer.updateCorpusStatistics([doc1, doc2, doc3]);

      const score1 = scorer.score(query, doc1);
      const score2 = scorer.score(query, doc2);
      const score3 = scorer.score(query, doc3);

      // Doc1 should score highest (contains both terms multiple times)
      expect(score1).toBeGreaterThan(score2);
      expect(score1).toBeGreaterThan(score3);

      // Scores should be positive for matching documents
      expect(score2).toBeGreaterThan(0);
      expect(score3).toBeGreaterThan(0);
    });

    it('should respect custom k1 and b parameters', () => {
      const query = 'test query';
      const document = 'test document with test query terms';

      scorer.updateCorpusStatistics([document]);

      // Default parameters
      const defaultScore = scorer.score(query, document);

      // Custom parameters (less term frequency saturation)
      scorer.setParameters(0.5, 0.9);
      const customScore = scorer.score(query, document);

      // Scores should differ
      expect(defaultScore).not.toBe(customScore);
    });

    it('should handle document length normalization', () => {
      const query = 'important term';
      const shortDoc = 'important term here';
      const longDoc =
        'this is a very long document with many words but also contains the important term somewhere in the middle of all this text';

      scorer.updateCorpusStatistics([shortDoc, longDoc]);

      const shortScore = scorer.score(query, shortDoc);
      const longScore = scorer.score(query, longDoc);

      // Short document should score higher due to length normalization
      expect(shortScore).toBeGreaterThan(longScore);
    });
  });

  describe('Semantic Scorer', () => {
    let scorer: SemanticScorer;

    beforeEach(() => {
      scorer = new SemanticScorer();
    });

    it('should calculate semantic similarity scores', () => {
      const query = 'car automobile';
      const doc1 = 'car vehicle automobile';
      const doc2 = 'bicycle motorcycle scooter';
      const doc3 = 'computer software technology';

      const score1 = scorer.score(query, doc1);
      const score2 = scorer.score(query, doc2);
      const score3 = scorer.score(query, doc3);

      // All scores should be between 0 and 1
      expect(score1).toBeGreaterThanOrEqual(0);
      expect(score1).toBeLessThanOrEqual(1);
      expect(score2).toBeGreaterThanOrEqual(0);
      expect(score2).toBeLessThanOrEqual(1);
      expect(score3).toBeGreaterThanOrEqual(0);
      expect(score3).toBeLessThanOrEqual(1);

      // Doc1 should have highest similarity (overlapping terms)
      expect(score1).toBeGreaterThan(0.5);
    });

    it('should handle empty inputs', () => {
      expect(scorer.score('', 'test')).toBe(0);
      expect(scorer.score('test', '')).toBe(0);
    });

    it('should produce consistent scores for same inputs', () => {
      const query = 'consistent test';
      const document = 'test for consistency';

      const score1 = scorer.score(query, document);
      const score2 = scorer.score(query, document);

      expect(score1).toBe(score2);
    });
  });

  describe('Hybrid Scorer', () => {
    let scorer: HybridScorer;

    beforeEach(() => {
      scorer = new HybridScorer();
    });

    it('should combine multiple scoring algorithms', () => {
      const query = 'machine learning algorithms';
      const doc1 = 'machine learning algorithms are powerful';
      const doc2 = 'deep learning is a subset of machine learning';
      const doc3 = 'traditional programming versus AI';

      scorer.updateCorpus([doc1, doc2, doc3]);

      const score1 = scorer.score(query, doc1);
      const score2 = scorer.score(query, doc2);
      const score3 = scorer.score(query, doc3);

      // Doc1 should score highest (exact match)
      expect(score1).toBeGreaterThan(score2);
      expect(score1).toBeGreaterThan(score3);

      // Doc2 should score higher than doc3
      expect(score2).toBeGreaterThan(score3);
    });

    it('should respect custom weights', () => {
      const query = 'test';
      const document = 'test document';

      scorer.updateCorpus([document]);

      // Default weights
      const defaultScore = scorer.score(query, document);

      // Custom weights (emphasize BM25)
      scorer.setWeights({
        tfidf: 0.1,
        bm25: 0.8,
        semantic: 0.1,
      });
      const customScore = scorer.score(query, document);

      // Scores should differ
      expect(defaultScore).not.toBe(customScore);
    });

    it('should normalize weights to sum to 1', () => {
      scorer.setWeights({
        tfidf: 10,
        bm25: 20,
        semantic: 10,
      });

      // Weights should be normalized internally
      // Test by ensuring score is still in reasonable range
      const score = scorer.score('test', 'test document');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10); // Should not be inflated by large weights
    });
  });

  describe('Scorer Factory', () => {
    it('should create correct scorer instances', () => {
      const tfidf = createScorer('tfidf');
      expect(tfidf).toBeInstanceOf(TFIDFScorer);

      const bm25 = createScorer('bm25');
      expect(bm25).toBeInstanceOf(BM25Scorer);

      const semantic = createScorer('semantic');
      expect(semantic).toBeInstanceOf(SemanticScorer);

      const hybrid = createScorer('hybrid');
      expect(hybrid).toBeInstanceOf(HybridScorer);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should score 100 documents in reasonable time', () => {
      const scorer = new BM25Scorer();
      const query = 'performance benchmark test';

      // Generate test documents
      const documents = Array.from(
        { length: 100 },
        (_, i) =>
          `Document ${i} contains various terms including benchmark and test`
      );

      scorer.updateCorpusStatistics(documents);

      const startTime = Date.now();

      // Score all documents
      for (const doc of documents) {
        scorer.score(query, doc);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle large documents efficiently', () => {
      const scorer = new HybridScorer();
      const query = 'search query';

      // Generate a large document (10,000 words)
      const largeDoc = Array.from(
        { length: 10000 },
        (_, i) => `word${i % 100}`
      ).join(' ');

      scorer.updateCorpus([largeDoc]);

      const startTime = Date.now();
      const score = scorer.score(query, largeDoc);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // Should complete in less than 50ms even for large document
      expect(duration).toBeLessThan(50);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});
