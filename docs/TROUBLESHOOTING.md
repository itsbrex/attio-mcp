# Troubleshooting Guide

## Overview

This guide helps diagnose and resolve common issues with the Attio MCP Server, particularly when using advanced features. Issues are organized by category with step-by-step resolution procedures.

## Quick Diagnostics

### Health Check Script

```bash
#!/bin/bash
# health-check.sh - Run comprehensive health check

echo "🔍 Attio MCP Server Health Check"
echo "================================"

# Check environment
echo -n "✓ Environment variables... "
if [ -z "$ATTIO_API_KEY" ]; then
  echo "❌ ATTIO_API_KEY not set"
  exit 1
else
  echo "✅"
fi

# Check server status
echo -n "✓ Server status... "
curl -s http://localhost:3000/api/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅"
else
  echo "❌ Server not responding"
  exit 1
fi

# Check feature status
echo -n "✓ Features status... "
FEATURES=$(curl -s http://localhost:3000/api/monitoring/features)
if [ $? -eq 0 ]; then
  echo "✅"
  echo "  Active features: $(echo $FEATURES | jq -r '.features | to_entries | map(select(.value == true)) | map(.key) | join(", ")')"
else
  echo "❌"
fi

# Check performance
echo -n "✓ Performance metrics... "
METRICS=$(curl -s http://localhost:3000/api/monitoring/metrics?period=5m)
if [ $? -eq 0 ]; then
  AVG_LATENCY=$(echo $METRICS | jq '.summary.avgLatency')
  ERROR_RATE=$(echo $METRICS | jq '.summary.errorRate')
  echo "✅"
  echo "  Avg latency: ${AVG_LATENCY}ms"
  echo "  Error rate: ${ERROR_RATE}"
else
  echo "❌"
fi

echo "================================"
echo "Health check complete!"
```

## Common Issues and Solutions

### 1. Server Won't Start

#### Symptoms
- Server crashes on startup
- Error: "Cannot find module"
- Port already in use error

#### Diagnosis
```bash
# Check if port is in use
lsof -i :3000

# Check dependencies
npm ls

# Check Node version
node --version  # Should be >= 18.0.0
```

#### Solutions

**Solution 1: Port conflict**
```bash
# Kill process using port 3000
kill -9 $(lsof -t -i:3000)

# Or use different port
PORT=3001 npm start
```

**Solution 2: Missing dependencies**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Rebuild native modules
npm rebuild
```

**Solution 3: Wrong Node version**
```bash
# Use Node 18 or later
nvm use 18
# or
volta install node@18
```

### 2. API Authentication Failures

#### Symptoms
- 401 Unauthorized errors
- "Invalid API key" messages
- All requests failing

#### Diagnosis
```typescript
// Test API key validity
const testApiKey = async () => {
  const response = await fetch('https://api.attio.com/v2/self', {
    headers: {
      'Authorization': `Bearer ${process.env.ATTIO_API_KEY}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    console.error('API key invalid or expired');
    console.error('Status:', response.status);
    const error = await response.text();
    console.error('Error:', error);
  } else {
    console.log('✅ API key is valid');
  }
};
```

#### Solutions

**Solution 1: Invalid API key format**
```bash
# Check for extra spaces or quotes
echo "$ATTIO_API_KEY" | cat -A

# Set correctly (no quotes in .env file)
echo "ATTIO_API_KEY=your_actual_key_here" > .env
```

**Solution 2: Wrong workspace**
```bash
# Verify workspace ID matches API key
export ATTIO_WORKSPACE_ID=correct_workspace_id
```

**Solution 3: Rate limiting**
```typescript
// Enable caching to reduce API calls
features.updateFlags({ 
  enableCache: true,
  enableRequestBatching: true 
});
```

### 3. High Memory Usage

#### Symptoms
- Memory usage > 500MB
- Server becomes unresponsive
- Out of memory errors

#### Diagnosis
```typescript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log({
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heap: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`
  });
}, 10000);

// Check cache size
console.log('Cache stats:', searchCache.getStats());
```

#### Solutions

**Solution 1: Reduce cache size**
```typescript
// Limit cache size
features.updateFlags({
  enableCache: true,
  cacheConfig: {
    maxSize: 1000,      // Reduce from 10000
    maxMemoryMB: 50,    // Reduce from 100
    ttl: 1800000        // 30 minutes instead of 1 hour
  }
});
```

**Solution 2: Enable memory optimization**
```typescript
// Enable memory features
features.updateFlags({
  enableMemoryOptimization: true,
  memoryConfig: {
    compressionEnabled: true,
    gcInterval: 300000,  // Force GC every 5 minutes
    maxHeapUsage: 200    // Trigger cleanup at 200MB
  }
});
```

**Solution 3: Clear caches periodically**
```typescript
// Auto-clear cache when memory is high
setInterval(() => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > 200 * 1024 * 1024) {
    searchCache.clear();
    recordCache.clear();
    global.gc?.();  // Force garbage collection
    console.log('Cleared caches due to high memory');
  }
}, 60000);
```

### 4. Slow Response Times

#### Symptoms
- API responses > 2 seconds
- Timeouts on searches
- Poor user experience

#### Diagnosis
```typescript
// Measure response times
const measureLatency = async () => {
  const operations = [
    { name: 'search', fn: () => search('test') },
    { name: 'fetch', fn: () => fetch('people:123') }
  ];
  
  for (const op of operations) {
    const start = Date.now();
    try {
      await op.fn();
      const duration = Date.now() - start;
      console.log(`${op.name}: ${duration}ms`);
    } catch (error) {
      console.error(`${op.name} failed:`, error);
    }
  }
};
```

#### Solutions

**Solution 1: Enable caching**
```typescript
// First call will be slow, subsequent calls fast
features.updateFlags({ enableCache: true });

// Warm cache with common queries
const warmCache = async () => {
  const commonQueries = ['sales', 'engineering', 'customers'];
  for (const query of commonQueries) {
    await search(query);
  }
};
```

**Solution 2: Enable batching**
```typescript
// Batch concurrent requests
features.updateFlags({
  enablePerformanceOptimization: true,
  enableRequestBatching: true,
  batchConfig: {
    maxBatchSize: 20,
    batchWindow: 200
  }
});
```

**Solution 3: Disable expensive features**
```typescript
// Temporarily disable scoring
features.updateFlags({
  enableRelevanceScoring: false,
  enableDataTransformation: false
});
```

### 5. Cache Not Working

#### Symptoms
- No performance improvement with cache enabled
- Cache hit rate is 0%
- Every request hits the API

#### Diagnosis
```typescript
// Check cache configuration
console.log('Cache enabled:', features.isEnabled('enableCache'));
console.log('Cache stats:', searchCache.getStats());

// Test cache manually
searchCache.set('test-key', { data: 'test' }, 60000);
console.log('Cache test:', searchCache.get('test-key'));
```

#### Solutions

**Solution 1: Cache not initialized**
```typescript
// Reinitialize cache
searchCache.clear();
recordCache.clear();

// Verify initialization
if (!searchCache) {
  searchCache = new SearchCache({
    ttl: 3600000,
    maxSize: 10000
  });
}
```

**Solution 2: Cache keys not matching**
```typescript
// Debug cache keys
searchCache.on('set', (key, value) => {
  console.log('Cache set:', key);
});

searchCache.on('get', (key, hit) => {
  console.log('Cache get:', key, hit ? 'HIT' : 'MISS');
});
```

**Solution 3: TTL too short**
```typescript
// Increase TTL for better hit rate
features.updateFlags({
  cacheConfig: {
    ttl: 7200000  // 2 hours
  }
});
```

### 6. Feature Flags Not Working

#### Symptoms
- Features enabled but not functioning
- Configuration not applying
- Inconsistent behavior

#### Diagnosis
```typescript
// Check all feature states
console.log('All features:', features.getAllFlags());

// Verify specific feature
const featureName = 'enableRelevanceScoring';
console.log(`${featureName}:`, {
  enabled: features.isEnabled(featureName),
  config: features.getConfig(featureName)
});

// Check environment variables
console.log('ENV:', {
  ENABLE_CACHE: process.env.ENABLE_CACHE,
  ENABLE_RELEVANCE_SCORING: process.env.ENABLE_RELEVANCE_SCORING
});
```

#### Solutions

**Solution 1: Environment variables not loaded**
```bash
# Load .env file
npm install dotenv
node -r dotenv/config index.js

# Or in code
import dotenv from 'dotenv';
dotenv.config();
```

**Solution 2: Feature dependencies**
```typescript
// Check dependencies
if (features.isEnabled('enableRequestBatching')) {
  // Request batching requires performance optimization
  features.updateFlags({
    enablePerformanceOptimization: true,
    enableRequestBatching: true
  });
}
```

**Solution 3: Configuration override**
```typescript
// Force update features
features.reset();  // Clear all
features.updateFlags({
  enableCache: true,
  enableRelevanceScoring: true
});
```

### 7. Error Recovery Not Working

#### Symptoms
- Errors not being retried
- Circuit breaker not triggering
- No fallback to cache

#### Diagnosis
```typescript
// Monitor error handling
advancedErrorHandler.on('error', (error) => {
  console.log('Error:', error);
});

advancedErrorHandler.on('retry', (attempt) => {
  console.log('Retry attempt:', attempt);
});

advancedErrorHandler.on('circuit-open', (feature) => {
  console.log('Circuit opened for:', feature);
});
```

#### Solutions

**Solution 1: Enable error handling features**
```typescript
features.updateFlags({
  enableAdvancedErrorHandling: true,
  enableAutoRecovery: true,
  enableCircuitBreaker: true,
  enableGracefulDegradation: true
});
```

**Solution 2: Configure retry strategy**
```typescript
const retryConfig = {
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', '429']
};

advancedErrorHandler.updateConfig(retryConfig);
```

**Solution 3: Fix circuit breaker**
```typescript
// Reset circuit breaker
circuitBreaker.reset();

// Adjust thresholds
circuitBreaker.updateConfig({
  errorThreshold: 10,  // Increase from 5
  timeout: 60000,       // Increase from 30000
  volumeThreshold: 20   // Minimum requests before opening
});
```

### 8. Data Transformation Errors

#### Symptoms
- Invalid data being returned
- Transformation pipeline failures
- Masked fields showing raw data

#### Diagnosis
```typescript
// Test transformation pipeline
const testPipeline = dataTransformer.getPipeline('userDataPipeline');
console.log('Pipeline exists:', !!testPipeline);

// Test individual transformation
const testData = { 
  email: 'test@example.com',
  phone: '5551234567',
  ssn: '123-45-6789'
};

const result = await dataTransformer.transform(testData, 'userDataPipeline');
console.log('Transformed:', result);
```

#### Solutions

**Solution 1: Pipeline not registered**
```typescript
// Register pipeline
dataTransformer.registerPipeline({
  name: 'userDataPipeline',
  rules: [
    { field: 'email', type: 'validate', config: { type: 'email' }},
    { field: 'phone', type: 'format', config: { format: 'international' }},
    { field: 'ssn', type: 'mask', config: { type: 'ssn' }}
  ]
});
```

**Solution 2: Invalid transformation rules**
```typescript
// Validate rules
const validateRules = (rules) => {
  for (const rule of rules) {
    if (!rule.field || !rule.type) {
      console.error('Invalid rule:', rule);
      return false;
    }
  }
  return true;
};
```

**Solution 3: Error in transformation**
```typescript
// Add error handling
dataTransformer.on('error', (error) => {
  console.error('Transformation error:', error);
  // Return original data on error
  return error.originalData;
});
```

### 9. WebSocket Connection Issues

#### Symptoms
- Real-time updates not working
- WebSocket disconnections
- No metrics streaming

#### Diagnosis
```javascript
// Test WebSocket connection
const ws = new WebSocket('ws://localhost:3000/ws/metrics');

ws.onopen = () => console.log('Connected');
ws.onerror = (error) => console.error('Error:', error);
ws.onclose = (event) => console.log('Closed:', event.code, event.reason);
ws.onmessage = (event) => console.log('Message:', event.data);
```

#### Solutions

**Solution 1: Enable WebSocket support**
```typescript
// Server configuration
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send heartbeat
  const heartbeat = setInterval(() => {
    ws.send(JSON.stringify({ type: 'heartbeat' }));
  }, 30000);
  
  ws.on('close', () => {
    clearInterval(heartbeat);
  });
});
```

**Solution 2: Handle reconnection**
```javascript
// Client-side reconnection logic
class ReconnectingWebSocket {
  constructor(url) {
    this.url = url;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.connect();
  }
  
  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onclose = () => {
      setTimeout(() => {
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay
        );
        this.connect();
      }, this.reconnectDelay);
    };
    
    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };
  }
}
```

### 10. A/B Testing Issues

#### Symptoms
- Experiments not tracking correctly
- Inconsistent variant assignment
- No statistical significance

#### Diagnosis
```typescript
// Check experiment status
const experiment = abTestingManager.getExperiment('experiment-id');
console.log('Experiment:', {
  status: experiment?.status,
  sampleSize: experiment?.currentSampleSize,
  variants: experiment?.variants.map(v => ({
    id: v.id,
    impressions: v.metrics?.impressions,
    conversions: v.metrics?.conversions
  }))
});

// Test variant assignment
const userId = 'test-user-123';
const variant = abTestingManager.getVariantAssignment(
  'experiment-id',
  userId
);
console.log('Assigned variant:', variant?.id);
```

#### Solutions

**Solution 1: Experiment not started**
```typescript
// Start experiment
abTestingManager.startExperiment('experiment-id');
```

**Solution 2: Tracking not implemented**
```typescript
// Track impressions and conversions
const variant = abTestingManager.getVariantAssignment(experimentId, userId);
if (variant) {
  // Track impression (automatic on assignment)
  
  // Track conversion when goal is achieved
  if (userConvertedAction) {
    abTestingManager.recordConversion(experimentId, variant.id, value);
  }
}
```

**Solution 3: Insufficient sample size**
```typescript
// Check required sample size
const results = abTestingManager.getExperimentResults('experiment-id');
console.log('Recommendations:', results?.recommendations);

// Wait for more data or adjust configuration
experiment.config.minSampleSize = 500;  // Reduce if appropriate
```

## Performance Debugging

### Profiling Tools

```typescript
// CPU Profiling
import { performance } from 'perf_hooks';

const profileOperation = async (name: string, fn: Function) => {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  
  console.log(`${name}: ${duration.toFixed(2)}ms`);
  
  if (duration > 1000) {
    console.warn(`⚠️ ${name} is slow!`);
  }
  
  return result;
};

// Memory Profiling
const profileMemory = () => {
  if (global.gc) {
    global.gc();
  }
  
  const before = process.memoryUsage();
  
  // Run operation
  
  const after = process.memoryUsage();
  
  console.log('Memory delta:', {
    rss: `${(after.rss - before.rss) / 1024 / 1024}MB`,
    heap: `${(after.heapUsed - before.heapUsed) / 1024 / 1024}MB`
  });
};
```

### Bottleneck Identification

```typescript
// Trace slow operations
class PerformanceTracer {
  private traces: Map<string, number[]> = new Map();
  
  trace(operation: string, duration: number) {
    if (!this.traces.has(operation)) {
      this.traces.set(operation, []);
    }
    this.traces.get(operation)!.push(duration);
    
    // Alert on slow operations
    if (duration > 1000) {
      console.warn(`Slow operation: ${operation} took ${duration}ms`);
    }
  }
  
  getStats() {
    const stats: any = {};
    
    for (const [op, durations] of this.traces) {
      durations.sort((a, b) => a - b);
      stats[op] = {
        count: durations.length,
        min: durations[0],
        max: durations[durations.length - 1],
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        p50: durations[Math.floor(durations.length * 0.5)],
        p95: durations[Math.floor(durations.length * 0.95)],
        p99: durations[Math.floor(durations.length * 0.99)]
      };
    }
    
    return stats;
  }
}

const tracer = new PerformanceTracer();
```

## Emergency Procedures

### Complete System Reset

```bash
#!/bin/bash
# emergency-reset.sh - Complete system reset

echo "⚠️  Emergency System Reset"
echo "This will reset all configurations and clear all caches"
read -p "Are you sure? (y/N): " confirm

if [ "$confirm" != "y" ]; then
  echo "Cancelled"
  exit 0
fi

# Stop server
echo "Stopping server..."
pkill -f "node.*attio-mcp" || true

# Clear all caches
echo "Clearing caches..."
rm -rf .cache/
rm -rf node_modules/.cache/

# Reset configuration
echo "Resetting configuration..."
cp features.json features.json.backup 2>/dev/null || true
echo '{}' > features.json

# Clear logs
echo "Clearing logs..."
rm -rf logs/*.log

# Reinstall dependencies
echo "Reinstalling dependencies..."
rm -rf node_modules package-lock.json
npm install

# Restart with minimal configuration
echo "Starting with minimal configuration..."
ENABLE_ALL_FEATURES=false npm start

echo "✅ System reset complete"
```

### Data Recovery

```typescript
// Recover from corrupted cache
const recoverCache = async () => {
  try {
    // Try to export existing cache
    const backup = searchCache.export();
    fs.writeFileSync('cache-backup.json', JSON.stringify(backup));
    console.log('Cache backed up');
  } catch (error) {
    console.error('Cache backup failed:', error);
  }
  
  // Clear and rebuild
  searchCache.clear();
  recordCache.clear();
  
  // Reinitialize with safe defaults
  searchCache = new SearchCache({
    ttl: 1800000,  // 30 minutes
    maxSize: 1000   // Small size
  });
  
  console.log('Cache recovered');
};
```

### Rollback Procedures

```typescript
// Automated rollback on high error rate
const monitorAndRollback = () => {
  let errorCount = 0;
  let requestCount = 0;
  
  setInterval(() => {
    const errorRate = errorCount / Math.max(requestCount, 1);
    
    if (errorRate > 0.1 && requestCount > 100) {
      console.error('High error rate detected, rolling back features');
      
      // Disable all advanced features
      features.updateFlags({
        enableCache: true,  // Keep cache for stability
        enableRelevanceScoring: false,
        enableAdvancedErrorHandling: true,  // Keep error handling
        enableDataTransformation: false,
        enablePerformanceOptimization: false,
        enableRequestBatching: false
      });
      
      // Notify
      console.log('🔄 Features rolled back due to high error rate');
      
      // Reset counters
      errorCount = 0;
      requestCount = 0;
    }
  }, 60000);  // Check every minute
};
```

## Getting Help

### Diagnostic Information to Collect

When reporting issues, include:

1. **Environment details**
```bash
node --version
npm --version
npm list attio-mcp
cat package.json | grep version
```

2. **Configuration**
```bash
cat .env | grep -v API_KEY  # Don't share API keys!
cat features.json
```

3. **Error logs**
```bash
tail -n 100 logs/error.log
```

4. **Performance metrics**
```bash
curl http://localhost:3000/api/monitoring/metrics?period=1h
```

5. **Feature status**
```bash
curl http://localhost:3000/api/monitoring/features
```

### Support Channels

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/kesslerio/attio-mcp-server/issues)
- **Documentation**: Check `/docs` folder for detailed guides
- **API Reference**: See `/docs/API_ENHANCEMENTS.md`
- **Migration Guide**: See `/docs/MIGRATION_GUIDE.md`
- **Performance Guide**: See `/docs/PERFORMANCE_TUNING.md`

### Debug Mode

Enable comprehensive debugging:

```typescript
// Enable all debug output
process.env.DEBUG = '*';
process.env.ENABLE_ENHANCED_LOGGING = 'true';

// Or specific modules
process.env.DEBUG = 'attio:cache,attio:search,attio:error';

// Start with debug mode
DEBUG=* npm start
```

### Monitoring Checklist

Regular monitoring tasks:

- [ ] Check error rate (< 1%)
- [ ] Monitor memory usage (< 200MB)
- [ ] Verify cache hit rate (> 60%)
- [ ] Review p95 latency (< 1000ms)
- [ ] Check API rate limits
- [ ] Validate feature health
- [ ] Review error logs
- [ ] Update dependencies
- [ ] Backup configuration
- [ ] Test rollback procedures

## Prevention Best Practices

1. **Gradual Rollout**: Enable features one at a time
2. **Monitor Metrics**: Set up alerts for key metrics
3. **Regular Updates**: Keep dependencies up to date
4. **Load Testing**: Test under expected load before production
5. **Documentation**: Document all configuration changes
6. **Backup Plans**: Always have rollback procedures ready
7. **Health Checks**: Implement automated health monitoring
8. **Error Budgets**: Define acceptable error rates
9. **Capacity Planning**: Monitor growth trends
10. **Security Audits**: Regular security reviews

## Appendix: Error Codes

| Code | Description | Common Cause | Solution |
|------|-------------|--------------|----------|
| E001 | API_KEY_INVALID | Wrong or expired API key | Check API key in .env |
| E002 | RATE_LIMIT_EXCEEDED | Too many API calls | Enable caching and batching |
| E003 | CACHE_INITIALIZATION_FAILED | Cache setup error | Check memory limits |
| E004 | FEATURE_DEPENDENCY_MISSING | Required feature not enabled | Enable parent features |
| E005 | CIRCUIT_BREAKER_OPEN | Too many failures | Wait for reset or fix underlying issue |
| E006 | MEMORY_LIMIT_EXCEEDED | Out of memory | Reduce cache size or enable optimization |
| E007 | TRANSFORMATION_PIPELINE_ERROR | Data transformation failed | Check pipeline configuration |
| E008 | WEBSOCKET_CONNECTION_FAILED | Can't establish WebSocket | Check server configuration |
| E009 | EXPERIMENT_NOT_FOUND | A/B test doesn't exist | Verify experiment ID |
| E010 | ROLLOUT_FAILED | Feature rollout error | Check rollout configuration |

---

*Last updated: January 2024*
*Version: 2.0.0*