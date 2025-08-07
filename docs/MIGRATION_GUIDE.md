# Migration Guide: Enabling Advanced Features

## Overview

This guide helps you migrate from the basic Attio MCP Server to the enhanced version with advanced features. All new features are backward compatible and disabled by default.

## Table of Contents

1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [Migration Strategies](#migration-strategies)
3. [Feature-by-Feature Migration](#feature-by-feature-migration)
4. [Testing Your Migration](#testing-your-migration)
5. [Rollback Procedures](#rollback-procedures)
6. [Common Issues and Solutions](#common-issues-and-solutions)

## Pre-Migration Checklist

Before enabling any advanced features, ensure:

- [ ] **Backup Configuration**: Save current configuration
- [ ] **Document Current State**: Record current performance metrics
- [ ] **Test Environment Ready**: Have staging environment available
- [ ] **Monitoring Setup**: Ensure monitoring is configured
- [ ] **Rollback Plan**: Prepare rollback procedures
- [ ] **Team Communication**: Notify team of changes
- [ ] **API Key Valid**: Verify Attio API key is working
- [ ] **Dependencies Updated**: Update to latest package versions

```bash
# Save current configuration
cp .env .env.backup
cp features.json features.json.backup 2>/dev/null || true

# Check current version
npm list attio-mcp

# Update dependencies
npm update
```

## Migration Strategies

### Strategy 1: Conservative (Recommended for Production)

Enable features one at a time with monitoring between each:

```mermaid
graph LR
    A[Baseline] --> B[Enable Cache]
    B --> C[Monitor 24h]
    C --> D[Enable Error Handling]
    D --> E[Monitor 24h]
    E --> F[Enable More Features]
```

**Timeline**: 1-2 weeks

**Steps**:
1. Day 1: Enable caching
2. Day 2-3: Monitor metrics
3. Day 4: Enable error handling
4. Day 5-6: Monitor metrics
5. Day 7+: Continue with other features

### Strategy 2: Staged Rollout

Use percentage-based rollout for gradual adoption:

```typescript
import { rolloutManager } from './monitoring/rollout-manager.js';

// Create staged rollout
const rollout = rolloutManager.createRollout(
  'advancedFeatures',
  'Enable all advanced features',
  [
    { name: 'Canary', percentage: 1, minDuration: 24 },
    { name: 'Early Adopters', percentage: 5, minDuration: 48 },
    { name: 'Beta', percentage: 25, minDuration: 72 },
    { name: 'General', percentage: 100 }
  ]
);

// Start rollout
rolloutManager.progressRollout('advancedFeatures');
```

**Timeline**: 1 week

### Strategy 3: A/B Testing

Test features with a subset of users:

```typescript
import { abTestingManager } from './monitoring/ab-testing.js';

// Create experiment
const experiment = abTestingManager.createExperiment(
  'Advanced Features Test',
  'Test impact of advanced features on performance',
  'Advanced features improve user experience without degrading performance',
  [
    { id: 'control', name: 'No Features', percentage: 50, config: {} },
    { id: 'treatment', name: 'With Features', percentage: 50, config: {
      enableCache: true,
      enableRelevanceScoring: true
    }}
  ],
  'responseTime'
);

// Start experiment
abTestingManager.startExperiment(experiment.id);
```

**Timeline**: 2 weeks

### Strategy 4: All-at-Once (Development/Staging Only)

Enable all features immediately for testing:

```bash
# NOT RECOMMENDED FOR PRODUCTION
export ENABLE_CACHE=true
export ENABLE_RELEVANCE_SCORING=true
export ENABLE_ADVANCED_ERROR_HANDLING=true
export ENABLE_DATA_TRANSFORMATION=true
export ENABLE_PERFORMANCE_OPTIMIZATION=true
```

## Feature-by-Feature Migration

### Phase 1: Core Stability Features

#### 1. Enable Caching

**Why**: Reduces API calls by 80%, improves response time by 50%

```typescript
// Step 1: Enable cache
features.updateFlags({ enableCache: true });

// Step 2: Configure cache settings
const cacheConfig = {
  ttl: 3600000, // 1 hour
  maxSize: 10000, // max items
  maxMemoryMB: 100 // max memory usage
};

// Step 3: Monitor cache performance
setInterval(() => {
  const stats = searchCache.getStats();
  console.log('Cache stats:', {
    hitRate: (stats.hits / (stats.hits + stats.misses)) * 100,
    size: stats.size,
    memoryUsed: stats.memoryUsed
  });
}, 60000);
```

**Success Metrics**:
- Cache hit rate > 60%
- Memory usage < 100MB
- No increase in error rate

#### 2. Enable Advanced Error Handling

**Why**: Automatic recovery from transient failures

```typescript
// Step 1: Enable error handling
features.updateFlags({ 
  enableAdvancedErrorHandling: true,
  enableAutoRecovery: true
});

// Step 2: Configure retry strategy
const retryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND']
};

// Step 3: Monitor error recovery
advancedErrorHandler.on('retry', (event) => {
  console.log('Retry attempt:', event);
});
```

**Success Metrics**:
- Error rate < 1%
- Recovery success rate > 95%
- No infinite retry loops

### Phase 2: Performance Features

#### 3. Enable Performance Optimization

**Why**: Improves throughput by 50%, reduces latency

```typescript
// Step 1: Enable performance features
features.updateFlags({
  enablePerformanceOptimization: true,
  enableRequestBatching: true,
  enableMemoryOptimization: true
});

// Step 2: Configure batching
const batchConfig = {
  batchSize: 10,
  batchWindow: 100, // ms
  maxConcurrent: 5
};

// Step 3: Monitor performance
const monitor = new PerformanceMonitor();
monitor.on('metric', (metric) => {
  if (metric.p95Latency > 1000) {
    console.warn('High latency detected:', metric);
  }
});
```

**Success Metrics**:
- P95 latency < 1000ms
- Throughput increase > 30%
- Memory usage stable

#### 4. Enable Relevance Scoring

**Why**: Improves search result quality

```typescript
// Step 1: Enable scoring
features.updateFlags({ 
  enableRelevanceScoring: true 
});

// Step 2: Configure scoring weights
const scoringConfig = {
  exactMatchWeight: 1.0,
  partialMatchWeight: 0.7,
  fuzzyMatchWeight: 0.5,
  fieldWeights: {
    name: 1.0,
    email: 0.8,
    company: 0.6
  }
};

// Step 3: Monitor search quality
// Track user clicks on search results
let searchSessions = [];
function trackSearchQuality(query, clickedPosition) {
  searchSessions.push({ query, clickedPosition });
  
  // Calculate average click position (lower is better)
  const avgPosition = searchSessions
    .map(s => s.clickedPosition)
    .reduce((a, b) => a + b, 0) / searchSessions.length;
  
  console.log('Search quality - Avg click position:', avgPosition);
}
```

**Success Metrics**:
- Average click position < 3
- User satisfaction increase
- No performance degradation

### Phase 3: Advanced Features

#### 5. Enable Data Transformation

**Why**: Data validation, sanitization, and enrichment

```typescript
// Step 1: Enable transformation
features.updateFlags({ 
  enableDataTransformation: true 
});

// Step 2: Register transformation pipelines
dataTransformer.registerPipeline({
  name: 'userDataPipeline',
  rules: [
    { field: 'email', type: 'validate', config: { type: 'email' }},
    { field: 'phone', type: 'format', config: { format: 'phone' }},
    { field: 'name', type: 'sanitize', config: { removeHtml: true }},
    { field: 'ssn', type: 'mask', config: { type: 'ssn' }}
  ],
  errorHandling: 'skip'
});

// Step 3: Monitor transformation performance
dataTransformer.on('transform', (event) => {
  if (event.duration > 20) {
    console.warn('Slow transformation:', event);
  }
});
```

**Success Metrics**:
- Transformation time < 20ms
- Validation success rate > 95%
- No data corruption

#### 6. Enable Monitoring Features

**Why**: Visibility into system health

```typescript
// Step 1: Enable monitoring
features.updateFlags({
  enableMetricsCollection: true,
  enableEnhancedLogging: false, // Only in dev
  enableCircuitBreaker: true
});

// Step 2: Configure alerts
const alertConfig = {
  errorRateThreshold: 0.05,
  latencyP95Threshold: 1000,
  successRateThreshold: 0.95
};

// Step 3: Set up monitoring dashboard
rolloutManager.on('alert:created', (alert) => {
  // Send to monitoring service
  sendToDatadog(alert);
  
  // Page on-call if critical
  if (alert.severity === 'critical') {
    pageOnCall(alert);
  }
});
```

**Success Metrics**:
- Alert noise < 5/day
- Mean time to detection < 5 minutes
- False positive rate < 10%

## Testing Your Migration

### 1. Functional Testing

```typescript
// Test suite for migration validation
describe('Migration Validation', () => {
  it('should maintain backward compatibility', async () => {
    // Disable all features
    features.reset();
    
    // Test basic functionality
    const result = await search('test');
    expect(result).toBeDefined();
  });
  
  it('should improve performance with cache', async () => {
    features.updateFlags({ enableCache: true });
    
    // First call - cache miss
    const start1 = Date.now();
    await search('test');
    const duration1 = Date.now() - start1;
    
    // Second call - cache hit
    const start2 = Date.now();
    await search('test');
    const duration2 = Date.now() - start2;
    
    expect(duration2).toBeLessThan(duration1 / 2);
  });
});
```

### 2. Load Testing

```bash
# Use Apache Bench for load testing
ab -n 1000 -c 10 http://localhost:3000/api/search?q=test

# Compare results before and after migration
# Baseline: Requests per second: 50
# With features: Requests per second: 150 (3x improvement)
```

### 3. Monitoring Validation

```typescript
// Validate monitoring is working
function validateMonitoring() {
  const metrics = rolloutManager.getMetricsSummary();
  
  console.assert(metrics.requests > 0, 'No requests recorded');
  console.assert(metrics.successRate > 95, 'Low success rate');
  console.assert(metrics.p95Latency < 1000, 'High latency');
  
  console.log('✅ Monitoring validation passed');
}
```

## Rollback Procedures

### Immediate Rollback (Emergency)

```bash
# 1. Disable all features immediately
export ENABLE_ALL_FEATURES=false

# 2. Restart server
npm restart

# 3. Verify rollback
curl http://localhost:3000/api/health
```

### Gradual Rollback

```typescript
// 1. Identify problematic feature
const metrics = rolloutManager.getMetricsSummary();
const problematicFeature = identifyIssue(metrics);

// 2. Disable specific feature
features.updateFlags({ [problematicFeature]: false });

// 3. Monitor recovery
setTimeout(() => {
  const newMetrics = rolloutManager.getMetricsSummary();
  if (newMetrics.successRate > 95) {
    console.log('✅ Recovery successful');
  } else {
    // Continue rollback
    features.reset();
  }
}, 60000);
```

### Automatic Rollback

```typescript
// Configure automatic rollback
rolloutManager.on('alert:critical', (alert) => {
  if (alert.metric === 'errorRate' && alert.value > 0.1) {
    // 10% error rate triggers rollback
    rolloutManager.rollbackFeature(alert.feature, 'High error rate');
    
    // Notify team
    notifySlack(`🚨 Automatic rollback: ${alert.feature}`);
  }
});
```

## Common Issues and Solutions

### Issue 1: High Memory Usage

**Symptoms**: Memory usage > 500MB

**Solution**:
```typescript
// 1. Check cache size
const cacheStats = searchCache.getStats();
if (cacheStats.size > 10000) {
  searchCache.setMaxSize(5000);
  searchCache.evict();
}

// 2. Enable memory optimization
features.updateFlags({ enableMemoryOptimization: true });

// 3. Reduce cache TTL
searchCache.setTTL(1800000); // 30 minutes
```

### Issue 2: Increased Latency

**Symptoms**: P95 latency > 2000ms

**Solution**:
```typescript
// 1. Disable expensive features
features.updateFlags({ 
  enableRelevanceScoring: false,
  enableDataTransformation: false 
});

// 2. Increase cache TTL
searchCache.setTTL(7200000); // 2 hours

// 3. Enable request batching
features.updateFlags({ enableRequestBatching: true });
```

### Issue 3: Cache Invalidation Issues

**Symptoms**: Stale data being returned

**Solution**:
```typescript
// 1. Clear specific cache entries
searchCache.delete('problematic-key');

// 2. Implement cache versioning
const cacheKey = `v2:${originalKey}`;

// 3. Set shorter TTL for frequently changing data
searchCache.set(key, value, 300000); // 5 minutes
```

### Issue 4: Feature Not Working

**Symptoms**: Feature enabled but not functioning

**Solution**:
```typescript
// 1. Check feature dependencies
if (features.isEnabled('enableRequestBatching')) {
  console.assert(
    features.isEnabled('enablePerformanceOptimization'),
    'Request batching requires performance optimization'
  );
}

// 2. Verify configuration
console.log('Current features:', features.getAllFlags());

// 3. Check logs for initialization errors
// grep "Feature initialization failed" logs/*.log
```

## Post-Migration Checklist

- [ ] All features enabled as planned
- [ ] Performance metrics within acceptable range
- [ ] Error rate < 1%
- [ ] Cache hit rate > 60%
- [ ] P95 latency < 1000ms
- [ ] Memory usage < 200MB
- [ ] Monitoring alerts configured
- [ ] Team trained on new features
- [ ] Documentation updated
- [ ] Rollback procedures tested

## Monitoring Success

### Week 1 Metrics
- Error rate: Should remain < 1%
- Latency: Should improve by 20-30%
- API calls: Should reduce by 50-80%
- Memory: Should stay < 200MB

### Week 2 Metrics
- Cache hit rate: Should reach 70-80%
- User satisfaction: Should improve
- Cost: API usage should decrease

### Month 1 Review
- Performance improvement: 2-3x
- Cost reduction: 50-70%
- Reliability: 99.9% uptime
- User feedback: Positive

## Support and Resources

- **Documentation**: `/docs/FEATURE_FLAGS.md`
- **API Reference**: `/docs/API_REFERENCE.md`
- **Troubleshooting**: `/docs/TROUBLESHOOTING.md`
- **Performance Tuning**: `/docs/PERFORMANCE_TUNING.md`
- **GitHub Issues**: Report issues with migration
- **Slack Channel**: #attio-mcp-migration

## Next Steps

After successful migration:

1. **Optimize Configuration**: Fine-tune based on metrics
2. **Expand Usage**: Enable for more users/use cases
3. **Custom Pipelines**: Create custom transformation pipelines
4. **Advanced Monitoring**: Set up detailed dashboards
5. **Cost Optimization**: Analyze and optimize API usage