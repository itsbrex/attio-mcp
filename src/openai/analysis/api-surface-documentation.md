# OpenAI Module API Surface Documentation

## Overview
This document provides a complete catalog of all public APIs exported from the `src/openai` directory, their consumers, and potential breaking changes from refactoring.

## 1. Primary Exports (`src/openai/index.ts`)

### Functions

#### `fetchRecord`
```typescript
export function fetchRecord(id: string): Promise<OpenAIFetchResult>
```
- **Purpose:** Fetches detailed information for a specific Attio record
- **Consumers:** 
  - `/src/transport/openai-adapter.ts`
  - `/src/health/http-server.ts`
- **Breaking Change Risk:** HIGH - Core API function used by transport layer

#### `search`
```typescript
export function search(query: string): Promise<OpenAISearchResult[]>
```
- **Purpose:** Searches across all Attio record types
- **Consumers:**
  - `/src/transport/openai-adapter.ts`
  - `/src/health/http-server.ts`
- **Breaking Change Risk:** HIGH - Core API function used by transport layer

#### `searchDirect`
```typescript
export function searchDirect(query: string): Promise<OpenAISearchResult[]>
```
- **Purpose:** Direct search without caching or enhancement
- **Consumers:** Internal use only
- **Breaking Change Risk:** LOW - Not externally consumed

### Objects

#### `openAITools`
```typescript
export const openAITools: OpenAITools = {
  search: (query: string) => Promise<OpenAISearchResult[]>,
  fetch: (id: string) => Promise<OpenAIFetchResult>
}
```
- **Consumers:**
  - `/src/transport/openai-adapter.ts` 
  - `/src/health/http-server.ts`
- **Breaking Change Risk:** CRITICAL - Direct integration point for ChatGPT

#### `openAIToolDefinitions`
```typescript
export const openAIToolDefinitions: Array<{
  type: string;
  function: {
    name: string;
    description: string;
    parameters: object;
  }
}>
```
- **Consumers:**
  - `/src/transport/openai-adapter.ts`
  - `/src/health/http-server.ts`
- **Breaking Change Risk:** CRITICAL - ChatGPT tool registration

## 2. Type Exports (`src/openai/types.ts`)

### Core Interfaces

#### `OpenAISearchResult`
```typescript
export interface OpenAISearchResult {
  id: string;
  title: string;
  text: string;
  url: string;
}
```
- **Consumers:** All transformer functions, transport layer
- **Breaking Change Risk:** HIGH - Core data contract

#### `OpenAIFetchResult`
```typescript
export interface OpenAIFetchResult {
  id: string;
  title: string;
  text: string;
  url: string;
  data?: Record<string, any>;
  metadata?: {
    recordType: string;
    lastUpdated?: string;
    [key: string]: any;
  };
}
```
- **Consumers:** All transformer functions, transport layer
- **Breaking Change Risk:** HIGH - Core data contract

#### `SupportedAttioType`
```typescript
export type SupportedAttioType = 'companies' | 'people' | 'lists' | 'tasks' | 'records';
```
- **Consumers:** Transformation logic throughout
- **Breaking Change Risk:** MEDIUM - Adding types is safe, removing is not

## 3. Advanced Module Exports (`src/openai/advanced/index.ts`)

### Cache System

#### Cache Classes
```typescript
export class AdvancedCache<T = any> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  getStats(): CacheStats;
}
```
- **Consumers:** Internal caching logic
- **Breaking Change Risk:** MEDIUM - API changes affect caching behavior

#### Cache Instances
```typescript
export const searchCache: AdvancedCache;
export const recordCache: AdvancedCache;
export const attributeCache: AdvancedCache;
```
- **Consumers:**
  - `/src/config/cache-config.ts`
  - Internal usage in fetch.ts and search.ts
- **Breaking Change Risk:** HIGH - Direct dependency in config

### Error Handling

#### Error Handler Class
```typescript
export class AdvancedErrorHandler {
  handleError(error: Error, context: ErrorContext): Promise<RecoveryStrategy>;
  categorizeError(error: Error): ErrorCategory;
  // ... other methods
}
```
- **Consumers:** Error recovery functions
- **Breaking Change Risk:** LOW - Mostly internal use

#### Error Enums
```typescript
export enum ErrorCategory {
  NETWORK = 'NETWORK',
  API = 'API',
  VALIDATION = 'VALIDATION',
  // ...
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
```
- **Consumers:** Error handling throughout
- **Breaking Change Risk:** MEDIUM - Adding values is safe

#### Fallback Functions
```typescript
export function executeSearchWithFallback(
  searchFn: () => Promise<any>,
  fallbackOptions?: FallbackOptions
): Promise<any>;

export function executeFetchWithFallback(
  fetchFn: () => Promise<any>,
  fallbackOptions?: FallbackOptions
): Promise<any>;
```
- **Consumers:** search.ts, fetch.ts
- **Breaking Change Risk:** MEDIUM - Internal API

### Scoring System

#### Scoring Types
```typescript
export type ScoringAlgorithm = 'tfidf' | 'bm25' | 'semantic' | 'hybrid';
```
- **Consumers:**
  - `/src/config/scoring-config.ts`
- **Breaking Change Risk:** MEDIUM - Config dependency

#### Relevance Scorer
```typescript
export class RelevanceScorer {
  scoreResults(results: any[], query: string): ScoredResult[];
  // ...
}

export const relevanceScorer: RelevanceScorer;
```
- **Consumers:**
  - `/src/config/scoring-config.ts`
  - Internal scoring logic
- **Breaking Change Risk:** MEDIUM - Config dependency

### Data Transformation

#### Transformer Classes
```typescript
export class AdvancedDataTransformer {
  transform(data: any, rules: TransformationRule[]): any;
  // ...
}

export const dataTransformer: AdvancedDataTransformer;
```
- **Consumers:**
  - `/src/config/transformation-config.ts`
  - Enhanced transformer
- **Breaking Change Risk:** MEDIUM - Config dependency

#### Pipeline Types
```typescript
export interface TransformationPipeline {
  name: string;
  stages: TransformationStage[];
  validation?: ValidationRule[];
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'format' | 'custom';
  // ...
}
```
- **Consumers:**
  - `/src/config/transformation-config.ts`
- **Breaking Change Risk:** MEDIUM - Config dependency

## 4. Transformer Exports (`src/openai/transformers/index.ts`)

### Main Transform Functions

#### `transformToSearchResult`
```typescript
export function transformToSearchResult(
  record: any,
  resourceType: SupportedAttioType
): OpenAISearchResult | null
```
- **Consumers:** search.ts, internal transformers
- **Breaking Change Risk:** HIGH - Core transformation API

#### `transformToFetchResult`
```typescript
export function transformToFetchResult(
  record: any,
  resourceType: SupportedAttioType
): OpenAIFetchResult | null
```
- **Consumers:** fetch.ts, internal transformers
- **Breaking Change Risk:** HIGH - Core transformation API

### Utility Functions

#### `extractAttributeValue`
```typescript
export function extractAttributeValue(attribute: any): string
```
- **Consumers:** All individual transformers
- **Breaking Change Risk:** MEDIUM - Internal utility

#### `buildTextDescription`
```typescript
export function buildTextDescription(
  attributes: any,
  fields: string[]
): string
```
- **Consumers:** Individual transformers
- **Breaking Change Risk:** MEDIUM - Internal utility

#### `generateRecordUrl`
```typescript
export function generateRecordUrl(
  recordId: string,
  resourceType: string
): string
```
- **Consumers:** Individual transformers
- **Breaking Change Risk:** LOW - URL generation

## 5. Consumer Analysis

### External Consumers (Outside openai/)

| File | Imports | Risk Level |
|------|---------|------------|
| `/src/transport/openai-adapter.ts` | openAITools, openAIToolDefinitions, OpenAIErrorResponse | CRITICAL |
| `/src/health/http-server.ts` | openAITools, openAIToolDefinitions, OpenAIErrorResponse | CRITICAL |
| `/src/config/cache-config.ts` | searchCache, recordCache, attributeCache | HIGH |
| `/src/config/scoring-config.ts` | ScoringAlgorithm, relevanceScorer | MEDIUM |
| `/src/config/transformation-config.ts` | TransformationPipeline, ValidationRule, dataTransformer | MEDIUM |

### Internal Cross-Dependencies

| Module | Dependencies | Notes |
|--------|--------------|-------|
| fetch.ts | transformers/, advanced/, types | Core implementation |
| search.ts | transformers/, advanced/, types | Core implementation |
| advanced/error-recovery.ts | advanced/cache, advanced/error-handler | Cross-module dependency |
| transformers/enhanced-transformer.ts | advanced/data-transformer | Enhancement layer |

## 6. Breaking Change Risk Matrix

### Risk Levels
- **CRITICAL:** Breaks external integrations (ChatGPT, transport)
- **HIGH:** Breaks core functionality or multiple consumers
- **MEDIUM:** Affects configuration or internal consumers
- **LOW:** Limited impact, mostly internal

### By Component

| Component | Risk | Mitigation Strategy |
|-----------|------|-------------------|
| openAITools object | CRITICAL | Must preserve exact structure |
| openAIToolDefinitions | CRITICAL | Must preserve for ChatGPT |
| Core interfaces (Search/Fetch Result) | HIGH | Need compatibility layer |
| Cache instances | HIGH | Preserve exports or add shims |
| Transform functions | HIGH | Keep signatures identical |
| Advanced features | MEDIUM | Can refactor with care |
| Internal utilities | LOW | Safe to refactor |

## 7. Refactoring Guidelines

### Safe Changes
1. Internal implementation details (algorithm improvements)
2. Adding new optional properties to interfaces
3. Adding new exports without removing existing ones
4. Refactoring internal module structure

### Dangerous Changes
1. Renaming or removing exported functions
2. Changing function signatures
3. Modifying core interface structures
4. Removing or renaming type exports

### Migration Strategy

#### Phase 1: Analysis (Current)
- Document all APIs ✅
- Identify consumers ✅
- Assess risk levels ✅

#### Phase 2: Compatibility Layer
- Create adapter functions for new APIs
- Maintain backward compatibility
- Add deprecation warnings

#### Phase 3: Migration
- Update internal consumers first
- Provide migration guide for external consumers
- Set deprecation timeline

#### Phase 4: Cleanup
- Remove deprecated APIs after grace period
- Update documentation
- Version bump for breaking changes

## Conclusion

The OpenAI module has 5 external consumers and numerous internal dependencies. The most critical preservation points are:

1. **openAITools** and **openAIToolDefinitions** - ChatGPT integration
2. **Core interfaces** - Data contracts across the system
3. **Cache instances** - Configuration dependencies
4. **Transform functions** - Core data processing

Any refactoring must carefully preserve these APIs or provide comprehensive compatibility layers to avoid breaking the system.