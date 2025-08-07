# Performance Tuning Guide

## Overview

This guide provides recommendations for optimizing the Attio MCP Server performance based on your specific use case and requirements.

## Performance Baselines

### Without Features (Baseline)
- **Search Latency**: 100-150ms
- **Fetch Latency**: 50-80ms
- **Memory Usage**: 50-100MB
- **API Calls**: 1:1 with requests
- **Throughput**: 50-100 req/s

### With Optimized Features
- **Search Latency**: 30-50ms (with cache)
- **Fetch Latency**: 10-20ms (with cache)
- **Memory Usage**: 100-200MB
- **API Calls**: 0.2:1 with requests (80% cache hit)
- **Throughput**: 200-500 req/s

## Quick Optimization Wins

### 1. Enable Caching (Biggest Impact)

**Impact**: 50-80% latency reduction, 80% API call reduction

```typescript
// Optimal cache configuration
const cacheConfig = {
  enableCache: true,
  cacheConfig: {
    ttl: 3600000,        // 1 hour
    maxSize: 10000,      // 10k items
    maxMemoryMB: 100,    // 100MB limit
    
    // Advanced settings
    compressionThreshold: 1024,  // Compress items > 1KB
    evictionPolicy: 'lru',        // Least Recently Used
    warmupOnStart: true,          // Preload common queries
  }
};

features.updateFlags(cacheConfig);
```

**Tuning Tips**:
- Increase TTL for stable data (users, companies)
- Decrease TTL for volatile data (tasks, deals)
- Monitor cache hit rate (target > 70%)

### 2. Enable Request Batching

**Impact**: 50-80% API call reduction for concurrent requests

```typescript
const batchingConfig = {
  enablePerformanceOptimization: true,
  enableRequestBatching: true,
  batchConfig: {
    maxBatchSize: 10,        // Max requests per batch
    batchWindow: 100,        // Wait up to 100ms
    maxConcurrent: 5,        // Max parallel batches
    
    // Advanced settings
    dynamicBatching: true,   // Adjust based on load
    priorityQueuing: true,   // Priority for interactive requests
  }
};
```

**Tuning Tips**:
- Increase batch window for background jobs (up to 500ms)
- Decrease for interactive use (50ms)
- Monitor batch efficiency (target > 5 requests/batch)

### 3. Optimize Memory Usage

**Impact**: 30-50% memory reduction

```typescript
const memoryConfig = {
  enableMemoryOptimization: true,
  memoryConfig: {
    compressionEnabled: true,
    compressionLevel: 6,     // 1-9, higher = better compression
    gcInterval: 300000,      // Force GC every 5 minutes
    maxHeapUsage: 200,       // MB, trigger cleanup
    
    // Object pooling
    poolConfig: {
      enabled: true,
      maxPoolSize: 100,
      recycleThreshold: 0.8, // Recycle when 80% used
    }
  }
};
```

## Use Case Specific Optimizations

### High-Volume Search (e.g., Autocomplete)

```typescript
const searchOptimizedConfig = {
  // Aggressive caching
  enableCache: true,
  cacheConfig: {
    ttl: 7200000,           // 2 hours
    maxSize: 50000,         // Large cache
    prefixCaching: true,    // Cache partial queries
  },
  
  // Fast scoring
  enableRelevanceScoring: true,
  scoringConfig: {
    algorithm: 'simple',    // Fast algorithm
    threshold: 0.3,         // Low threshold
    maxResults: 10,         // Limit results
  },
  
  // Disable expensive features
  enableDataTransformation: false,
  enableAdvancedErrorHandling: false,
};
```

**Expected Performance**:
- Latency: < 20ms
- Cache hit rate: > 90%
- Throughput: 500+ req/s

### Data Synchronization (Batch Operations)

```typescript
const syncOptimizedConfig = {
  // Batch everything
  enableRequestBatching: true,
  batchConfig: {
    maxBatchSize: 50,       // Large batches
    batchWindow: 500,       // Longer wait
    retryOnPartialFailure: true,
  },
  
  // Reliability over speed
  enableAdvancedErrorHandling: true,
  errorConfig: {
    maxRetries: 5,
    backoffMultiplier: 2,
    circuitBreakerThreshold: 10,
  },
  
  // Lower cache TTL for fresh data
  cacheConfig: {
    ttl: 300000,            // 5 minutes
  }
};
```

**Expected Performance**:
- API efficiency: 95% reduction
- Error recovery: 99.9%
- Throughput: 1000+ records/minute

### Real-time Dashboard

```typescript
const dashboardOptimizedConfig = {
  // Moderate caching
  enableCache: true,
  cacheConfig: {
    ttl: 60000,             // 1 minute
    maxSize: 1000,          // Small cache
  },
  
  // WebSocket for updates
  enableWebSocket: true,
  wsConfig: {
    heartbeatInterval: 30000,
    reconnectDelay: 1000,
    maxReconnectAttempts: 10,
  },
  
  // Fast updates
  enableMetricsCollection: true,
  metricsConfig: {
    sampleRate: 1.0,       // 100% sampling
    flushInterval: 1000,   // Send every second
  }
};
```

**Expected Performance**:
- Update latency: < 100ms
- Data freshness: < 1 minute
- Connection stability: 99.9%

### API Gateway/Proxy

```typescript
const gatewayOptimizedConfig = {
  // Maximum performance
  enableCache: true,
  enableRequestBatching: true,
  enableMemoryOptimization: true,
  enableLoadBalancing: true,
  
  // Circuit breaker for resilience
  enableCircuitBreaker: true,
  circuitConfig: {
    errorThreshold: 5,
    timeout: 30000,
    halfOpenRequests: 3,
  },
  
  // Rate limiting
  rateLimitConfig: {
    windowMs: 60000,
    maxRequests: 1000,
    keyGenerator: 'ip',    // or 'user', 'apikey'
  }
};
```

**Expected Performance**:
- Throughput: 1000+ req/s
- Availability: 99.99%
- Latency: < 50ms p99

## Database Query Optimization

### Index Optimization

```typescript
// Ensure proper indexes for common queries
const indexConfig = {
  searchIndexes: [
    'name',
    'email',
    'company',
    'created_at',
  ],
  compositeIndexes: [
    ['type', 'status'],
    ['owner', 'created_at'],
  ]
};
```

### Query Optimization

```typescript
// Use field selection to reduce payload
const optimizedQuery = {
  fields: ['id', 'name', 'email'],  // Only needed fields
  limit: 20,                         // Reasonable limit
  includes: [],                      // Avoid unnecessary joins
};

// Use cursor pagination for large datasets
const cursorPagination = {
  cursor: lastCursor,
  limit: 100,
  // Avoid offset pagination for large offsets
};
```

## Caching Strategies

### Cache Warming

```typescript
// Preload common queries on startup
async function warmCache() {
  const commonQueries = [
    'sales team',
    'engineering',
    'customers',
    'active deals',
  ];
  
  for (const query of commonQueries) {
    await search(query, { cache: { force: true } });
  }
  
  console.log('Cache warmed with common queries');
}

// Run on startup
setTimeout(warmCache, 5000);
```

### Cache Invalidation

```typescript
// Smart cache invalidation
const cacheInvalidationRules = {
  // Invalidate on write
  onUpdate: (record) => {
    searchCache.invalidatePattern(`*${record.id}*`);
    recordCache.delete(record.id);
  },
  
  // Time-based invalidation
  schedules: [
    { pattern: 'deals:*', ttl: 300000 },      // 5 min for deals
    { pattern: 'people:*', ttl: 3600000 },    // 1 hour for people
    { pattern: 'companies:*', ttl: 7200000 }, // 2 hours for companies
  ],
  
  // Event-based invalidation
  webhooks: {
    onRecordUpdate: (event) => {
      cacheInvalidationRules.onUpdate(event.record);
    }
  }
};
```

### Multi-tier Caching

```typescript
// L1: In-memory cache (fast, small)
const l1Cache = new Map();
const L1_MAX_SIZE = 100;
const L1_TTL = 60000; // 1 minute

// L2: Redis cache (slower, larger)
const l2Cache = redis.createClient();
const L2_TTL = 3600; // 1 hour

// L3: CDN cache (slowest, unlimited)
const cdnHeaders = {
  'Cache-Control': 'public, max-age=86400', // 1 day
  'CDN-Cache-Control': 'max-age=86400'
};

async function tieredGet(key: string) {
  // Check L1
  if (l1Cache.has(key)) {
    return l1Cache.get(key);
  }
  
  // Check L2
  const l2Value = await l2Cache.get(key);
  if (l2Value) {
    l1Cache.set(key, l2Value);
    return l2Value;
  }
  
  // Fetch from source
  const value = await fetchFromAPI(key);
  
  // Populate caches
  l1Cache.set(key, value);
  await l2Cache.setex(key, L2_TTL, value);
  
  return value;
}
```

## Memory Management

### Memory Monitoring

```typescript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  const metrics = {
    rss: Math.round(usage.rss / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    external: Math.round(usage.external / 1024 / 1024),
  };
  
  console.log('Memory usage (MB):', metrics);
  
  // Alert if too high
  if (metrics.heapUsed > 200) {
    console.warn('High memory usage detected');
    
    // Clear caches if needed
    if (metrics.heapUsed > 300) {
      searchCache.clear();
      recordCache.clear();
      global.gc?.(); // Force garbage collection
    }
  }
}, 60000); // Every minute
```

### Memory Leak Prevention

```typescript
// Prevent memory leaks
class MemoryManager {
  private subscriptions = new Set();
  private timers = new Set();
  
  addSubscription(subscription: any) {
    this.subscriptions.add(subscription);
  }
  
  addTimer(timer: NodeJS.Timeout) {
    this.timers.add(timer);
  }
  
  cleanup() {
    // Clean subscriptions
    for (const sub of this.subscriptions) {
      sub.unsubscribe?.();
    }
    this.subscriptions.clear();
    
    // Clear timers
    for (const timer of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.timers.clear();
    
    // Clear caches
    searchCache.clear();
    recordCache.clear();
    
    // Force GC
    global.gc?.();
  }
}

const memoryManager = new MemoryManager();

// Use in cleanup
process.on('SIGTERM', () => {
  memoryManager.cleanup();
  process.exit(0);
});
```

## Network Optimization

### Connection Pooling

```typescript
const connectionConfig = {
  // HTTP agent configuration
  httpAgent: {
    keepAlive: true,
    keepAliveMsecs: 3000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 30000,
  },
  
  // Retry configuration
  retry: {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 10000,
    randomize: true,
  }
};
```

### Request Compression

```typescript
// Enable compression for large payloads
const compressionConfig = {
  threshold: 1024,  // Compress if > 1KB
  level: 6,         // zlib compression level
  
  // Brotli for better compression
  brotli: {
    enabled: true,
    quality: 4,     // 0-11, higher = better compression
    lgwin: 22,      // Window size
  }
};

// Apply to requests
axios.defaults.headers['Accept-Encoding'] = 'br, gzip, deflate';
```

### Parallel Request Optimization

```typescript
// Optimize parallel requests
async function parallelFetch(ids: string[]) {
  // Chunk to avoid overwhelming the server
  const chunks = chunk(ids, 10);
  
  const results = [];
  for (const chunk of chunks) {
    // Process chunk in parallel
    const chunkResults = await Promise.all(
      chunk.map(id => 
        fetch(id).catch(err => ({ id, error: err }))
      )
    );
    results.push(...chunkResults);
    
    // Small delay between chunks
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}
```

## Monitoring and Alerting

### Key Metrics to Monitor

```typescript
const keyMetrics = {
  // Performance metrics
  latency: {
    p50: { target: 30, alert: 50 },
    p95: { target: 100, alert: 200 },
    p99: { target: 200, alert: 500 },
  },
  
  // Throughput metrics
  requestsPerSecond: {
    min: 10,
    target: 100,
    max: 500,
  },
  
  // Cache metrics
  cacheHitRate: {
    target: 0.75,
    alert: 0.50,
  },
  
  // Error metrics
  errorRate: {
    target: 0.001,
    alert: 0.01,
  },
  
  // Resource metrics
  memory: {
    target: 150,  // MB
    alert: 250,
  },
  
  cpu: {
    target: 50,   // %
    alert: 80,
  }
};
```

### Performance Dashboard

```typescript
// Real-time performance dashboard
class PerformanceDashboard {
  private metrics = new Map();
  
  update(metric: string, value: number) {
    const history = this.metrics.get(metric) || [];
    history.push({ time: Date.now(), value });
    
    // Keep last hour of data
    const cutoff = Date.now() - 3600000;
    const filtered = history.filter(h => h.time > cutoff);
    
    this.metrics.set(metric, filtered);
  }
  
  getReport() {
    const report: any = {};
    
    for (const [metric, history] of this.metrics) {
      const values = history.map(h => h.value);
      report[metric] = {
        current: values[values.length - 1],
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }
    
    return report;
  }
}
```

## Load Testing

### Basic Load Test

```bash
# Using Apache Bench
ab -n 10000 -c 100 http://localhost:3000/api/search?q=test

# Using wrk
wrk -t12 -c400 -d30s --latency http://localhost:3000/api/search?q=test

# Using k6
k6 run load-test.js
```

### K6 Load Test Script

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Stay at 100
    { duration: '2m', target: 200 },  // Spike
    { duration: '5m', target: 200 },  // Stay at 200
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
    http_req_failed: ['rate<0.1'],    // Error rate < 10%
  },
};

export default function() {
  let response = http.get('http://localhost:3000/api/search?q=test');
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
```

## Optimization Checklist

### Before Production

- [ ] Enable caching with appropriate TTL
- [ ] Configure request batching
- [ ] Set up connection pooling
- [ ] Enable compression
- [ ] Configure rate limiting
- [ ] Set up monitoring
- [ ] Perform load testing
- [ ] Document configuration

### Weekly Review

- [ ] Review cache hit rates
- [ ] Check error rates
- [ ] Analyze slow queries
- [ ] Review memory usage
- [ ] Check API usage
- [ ] Update cache rules
- [ ] Review monitoring alerts

### Monthly Optimization

- [ ] Analyze usage patterns
- [ ] Optimize cache TTLs
- [ ] Review and update indexes
- [ ] Update batching configuration
- [ ] Performance regression testing
- [ ] Capacity planning
- [ ] Cost optimization review

## Common Performance Issues

### Issue: High Latency Spikes

**Symptoms**: P99 latency > 2 seconds

**Solutions**:
1. Enable request batching
2. Increase cache TTL
3. Optimize slow queries
4. Add connection pooling
5. Enable circuit breaker

### Issue: Low Cache Hit Rate

**Symptoms**: Cache hit rate < 50%

**Solutions**:
1. Increase cache size
2. Adjust TTL based on data volatility
3. Implement cache warming
4. Use prefix caching for searches
5. Review cache key strategy

### Issue: Memory Growth

**Symptoms**: Memory usage growing over time

**Solutions**:
1. Enable memory optimization
2. Reduce cache size
3. Implement cache eviction
4. Fix memory leaks
5. Force periodic GC

### Issue: API Rate Limiting

**Symptoms**: 429 errors from API

**Solutions**:
1. Enable request batching
2. Increase cache usage
3. Implement exponential backoff
4. Use webhook updates
5. Optimize query patterns

## Best Practices

1. **Start with caching** - Biggest performance win
2. **Monitor everything** - Can't optimize what you don't measure
3. **Test under load** - Discover issues before production
4. **Gradual optimization** - Don't enable everything at once
5. **Document changes** - Track what works
6. **Set alerts** - Catch issues early
7. **Regular reviews** - Performance degrades over time
8. **Cache wisely** - Not everything should be cached
9. **Handle failures** - Graceful degradation
10. **Keep it simple** - Complexity hurts performance