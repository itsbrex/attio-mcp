# API Enhancements Documentation

## Overview

This document describes the optional API enhancements available when advanced features are enabled. All enhancements are backward compatible and opt-in.

## Enhanced Search API

### Standard Search Request

```typescript
// Basic search (always available)
POST /api/search
{
  "query": "John Doe",
  "type": "people"  // Optional: people, companies, lists, tasks
}
```

### Enhanced Search Request (with features enabled)

```typescript
// Enhanced search with optional fields
POST /api/search
{
  "query": "John Doe",
  "type": "people",
  
  // Optional: Relevance scoring parameters
  "scoring": {
    "enabled": true,              // Enable relevance scoring
    "weights": {                  // Custom field weights
      "name": 1.0,
      "email": 0.8,
      "company": 0.6
    },
    "fuzzyMatch": true,           // Enable fuzzy matching
    "threshold": 0.5              // Minimum score threshold
  },
  
  // Optional: Caching control
  "cache": {
    "enabled": true,              // Use cache if available
    "ttl": 3600000,              // Cache TTL in ms
    "force": false               // Force cache refresh
  },
  
  // Optional: Pagination
  "pagination": {
    "limit": 20,                 // Results per page
    "offset": 0,                 // Starting position
    "cursor": "eyJpZCI6MTIzfQ"   // Cursor-based pagination
  },
  
  // Optional: Filtering
  "filters": {
    "created_after": "2024-01-01",
    "updated_after": "2024-06-01",
    "has_email": true,
    "has_phone": true,
    "custom_fields": {
      "industry": "Technology",
      "size": "100-500"
    }
  },
  
  // Optional: Field selection
  "fields": ["id", "name", "email", "company", "score"],
  
  // Optional: Sorting
  "sort": {
    "field": "relevance",         // relevance, name, created_at
    "order": "desc"               // asc, desc
  }
}
```

### Enhanced Search Response

```typescript
// Standard response
{
  "results": [
    {
      "id": "people:person-123",
      "title": "John Doe",
      "text": "Software Engineer at Acme Corp",
      "url": "https://app.attio.com/people/person-123"
    }
  ]
}

// Enhanced response (with features enabled)
{
  "results": [
    {
      "id": "people:person-123",
      "title": "John Doe",
      "text": "Software Engineer at Acme Corp",
      "url": "https://app.attio.com/people/person-123",
      
      // Optional: Relevance score
      "score": 0.95,
      "scoreDetails": {
        "exactMatch": true,
        "fieldScores": {
          "name": 1.0,
          "email": 0.8
        }
      },
      
      // Optional: Highlighted matches
      "highlights": {
        "name": "<mark>John Doe</mark>",
        "email": "<mark>john</mark>@example.com"
      },
      
      // Optional: Additional metadata
      "metadata": {
        "source": "cache",
        "cached_at": "2024-01-15T10:30:00Z",
        "processing_time": 12
      }
    }
  ],
  
  // Optional: Pagination info
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true,
    "nextCursor": "eyJpZCI6MTQzfQ"
  },
  
  // Optional: Performance metrics
  "metrics": {
    "query_time": 45,
    "cache_hit": true,
    "results_from_cache": 15,
    "results_from_api": 5
  },
  
  // Optional: Facets for filtering
  "facets": {
    "companies": {
      "Acme Corp": 25,
      "Tech Inc": 18
    },
    "locations": {
      "San Francisco": 30,
      "New York": 22
    }
  }
}
```

## Enhanced Fetch API

### Standard Fetch Request

```typescript
// Basic fetch (always available)
GET /api/fetch/{id}
```

### Enhanced Fetch Request

```typescript
// Enhanced fetch with query parameters
GET /api/fetch/{id}?include=related&transform=true&cache=true

// Or as POST with body
POST /api/fetch
{
  "id": "people:person-123",
  
  // Optional: Include related data
  "include": {
    "related": true,              // Include related records
    "relationships": ["company", "deals", "tasks"],
    "depth": 2                    // Relationship depth
  },
  
  // Optional: Data transformation
  "transform": {
    "pipeline": "userDataPipeline",
    "rules": [
      { "field": "phone", "type": "format", "config": { "format": "international" }},
      { "field": "ssn", "type": "mask", "config": { "type": "ssn" }}
    ]
  },
  
  // Optional: Field selection
  "fields": ["id", "name", "email", "company", "custom_fields"],
  
  // Optional: Format options
  "format": {
    "dates": "iso8601",          // iso8601, unix, relative
    "numbers": "formatted",       // raw, formatted, currency
    "empty_fields": "exclude"    // include, exclude, null
  }
}
```

### Enhanced Fetch Response

```typescript
// Standard response
{
  "id": "people:person-123",
  "data": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "url": "https://app.attio.com/people/person-123"
}

// Enhanced response (with features enabled)
{
  "id": "people:person-123",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1 (555) 123-4567",    // Formatted
    "ssn": "***-**-6789",            // Masked
    "created_at": "2024-01-15T10:30:00Z",
    "custom_fields": {
      "industry": "Technology",
      "employee_count": 500
    }
  },
  "url": "https://app.attio.com/people/person-123",
  
  // Optional: Related records
  "related": {
    "company": {
      "id": "companies:company-456",
      "name": "Acme Corp",
      "domain": "acme.com"
    },
    "deals": [
      {
        "id": "deals:deal-789",
        "name": "Enterprise Deal",
        "value": 50000,
        "stage": "Negotiation"
      }
    ],
    "tasks": [
      {
        "id": "tasks:task-101",
        "name": "Follow up call",
        "due_date": "2024-01-20"
      }
    ]
  },
  
  // Optional: Metadata
  "metadata": {
    "fetched_at": "2024-01-15T10:30:00Z",
    "source": "cache",
    "ttl": 3600,
    "version": "2.0",
    "transformations_applied": ["format_phone", "mask_ssn"]
  },
  
  // Optional: Computed fields
  "computed": {
    "days_since_contact": 15,
    "engagement_score": 85,
    "lifecycle_stage": "Customer"
  }
}
```

## Batch Operations API

### Batch Search

```typescript
POST /api/batch/search
{
  "requests": [
    {
      "id": "req-1",
      "query": "John",
      "type": "people"
    },
    {
      "id": "req-2",
      "query": "Acme",
      "type": "companies"
    }
  ],
  "options": {
    "parallel": true,            // Process in parallel
    "max_concurrent": 5,         // Max concurrent requests
    "stop_on_error": false,      // Continue on errors
    "timeout": 30000            // Total timeout in ms
  }
}

// Response
{
  "results": {
    "req-1": {
      "status": "success",
      "data": { /* search results */ }
    },
    "req-2": {
      "status": "success",
      "data": { /* search results */ }
    }
  },
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "duration": 125
  }
}
```

### Batch Fetch

```typescript
POST /api/batch/fetch
{
  "ids": [
    "people:person-123",
    "companies:company-456",
    "deals:deal-789"
  ],
  "options": {
    "include_related": true,
    "transform": true,
    "cache": true
  }
}

// Response
{
  "results": [
    { /* person data */ },
    { /* company data */ },
    { /* deal data */ }
  ],
  "errors": [],
  "metrics": {
    "from_cache": 2,
    "from_api": 1,
    "duration": 45
  }
}
```

## Transformation API

### Create Transformation Pipeline

```typescript
POST /api/transform/pipeline
{
  "name": "customerDataPipeline",
  "description": "Transform customer data for display",
  "rules": [
    {
      "field": "phone",
      "type": "format",
      "config": { "format": "international" }
    },
    {
      "field": "email",
      "type": "validate",
      "config": { "type": "email" }
    },
    {
      "field": "ssn",
      "type": "mask",
      "config": { "type": "ssn" }
    },
    {
      "field": "revenue",
      "type": "format",
      "config": { "format": "currency" }
    }
  ],
  "errorHandling": "skip",
  "validation": true
}
```

### Apply Transformation

```typescript
POST /api/transform/apply
{
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "5551234567",
    "ssn": "123-45-6789",
    "revenue": 125000
  },
  "pipeline": "customerDataPipeline"
}

// Response
{
  "transformed": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1 (555) 123-4567",
    "ssn": "***-**-6789",
    "revenue": "$125,000.00"
  },
  "validation": {
    "valid": true,
    "errors": []
  },
  "metrics": {
    "duration": 5,
    "rules_applied": 4
  }
}
```

## Monitoring API

### Get Feature Status

```typescript
GET /api/monitoring/features

// Response
{
  "features": {
    "enableCache": true,
    "enableRelevanceScoring": true,
    "enableAdvancedErrorHandling": true,
    "enableDataTransformation": false,
    "enablePerformanceOptimization": true
  },
  "health": {
    "cache": {
      "enabled": true,
      "healthy": true,
      "hitRate": 0.75,
      "size": 4523,
      "memoryUsed": 45678901
    },
    "performance": {
      "avgLatency": 45,
      "p95Latency": 120,
      "p99Latency": 250,
      "requestsPerSecond": 150
    },
    "errors": {
      "rate": 0.002,
      "lastError": "2024-01-15T10:25:00Z",
      "recoveryRate": 0.98
    }
  }
}
```

### Get Metrics

```typescript
GET /api/monitoring/metrics?period=1h&interval=5m

// Response
{
  "metrics": [
    {
      "timestamp": "2024-01-15T10:00:00Z",
      "requests": 1500,
      "errors": 3,
      "avgLatency": 42,
      "cacheHits": 1125,
      "cacheMisses": 375
    },
    // ... more data points
  ],
  "summary": {
    "period": "1h",
    "totalRequests": 18000,
    "errorRate": 0.002,
    "avgLatency": 45,
    "cacheHitRate": 0.75
  }
}
```

### Get Rollout Status

```typescript
GET /api/monitoring/rollouts

// Response
{
  "rollouts": [
    {
      "feature": "enableRelevanceScoring",
      "status": "in-progress",
      "stage": "Beta",
      "percentage": 25,
      "metrics": {
        "requests": 5000,
        "errors": 10,
        "successRate": 99.8,
        "avgLatency": 48
      },
      "startedAt": "2024-01-14T00:00:00Z"
    }
  ]
}
```

## WebSocket API (Real-time Updates)

### Subscribe to Metrics

```javascript
// Client-side WebSocket connection
const ws = new WebSocket('ws://localhost:3000/ws/metrics');

ws.onopen = () => {
  // Subscribe to specific metrics
  ws.send(JSON.stringify({
    type: 'subscribe',
    metrics: ['latency', 'errors', 'cache'],
    interval: 1000  // Update every second
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Metric update:', data);
  // {
  //   "type": "metric",
  //   "timestamp": "2024-01-15T10:30:00Z",
  //   "data": {
  //     "latency": { "current": 45, "p95": 120 },
  //     "errors": { "rate": 0.002, "count": 3 },
  //     "cache": { "hitRate": 0.75, "size": 4523 }
  //   }
  // }
};
```

### Subscribe to Alerts

```javascript
const ws = new WebSocket('ws://localhost:3000/ws/alerts');

ws.onmessage = (event) => {
  const alert = JSON.parse(event.data);
  console.log('Alert:', alert);
  // {
  //   "type": "alert",
  //   "severity": "warning",
  //   "feature": "enableCache",
  //   "message": "Cache hit rate below threshold",
  //   "value": 0.45,
  //   "threshold": 0.60,
  //   "timestamp": "2024-01-15T10:30:00Z"
  // }
};
```

## Error Codes

### Standard Error Response

```typescript
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "API rate limit exceeded",
    "details": {
      "limit": 100,
      "window": "1m",
      "retryAfter": 45
    }
  }
}
```

### Enhanced Error Codes

| Code | Description | Recovery Action |
|------|-------------|-----------------|
| `CACHE_MISS` | Requested data not in cache | Retry with `cache.force = false` |
| `TRANSFORMATION_FAILED` | Data transformation error | Check transformation rules |
| `SCORING_THRESHOLD_NOT_MET` | No results meet score threshold | Lower threshold or disable scoring |
| `BATCH_PARTIAL_FAILURE` | Some batch requests failed | Check individual request errors |
| `PIPELINE_NOT_FOUND` | Transformation pipeline doesn't exist | Create pipeline or use different name |
| `CIRCUIT_OPEN` | Circuit breaker is open | Wait for circuit to close (30s) |
| `FEATURE_DISABLED` | Required feature is not enabled | Enable feature in configuration |
| `ROLLBACK_IN_PROGRESS` | Feature is being rolled back | Wait for rollback to complete |

## Rate Limiting

### Standard Rate Limits

- Default: 100 requests/minute
- Search: 50 requests/minute
- Fetch: 200 requests/minute
- Batch: 10 requests/minute

### Enhanced Rate Limits (with caching enabled)

- Default: 500 requests/minute (with 75% cache hit rate)
- Search: 200 requests/minute
- Fetch: 1000 requests/minute
- Batch: 50 requests/minute

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1705318200
X-RateLimit-Window: 60
X-Cache-Hit: true
X-Response-Time: 45ms
```

## Backward Compatibility

All enhanced features are opt-in and backward compatible:

1. **Default Behavior**: Without any optional parameters, APIs work exactly as before
2. **Gradual Adoption**: Enable features one at a time
3. **Version Header**: Use `X-API-Version` header to specify behavior
4. **Feature Detection**: Check `/api/monitoring/features` to see what's available

```typescript
// Works with both old and new versions
const response = await fetch('/api/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Version': '2.0'  // Optional: Use enhanced features
  },
  body: JSON.stringify({
    query: 'test',
    // Optional enhanced parameters
    ...(featuresEnabled && {
      scoring: { enabled: true },
      cache: { enabled: true }
    })
  })
});
```

## SDK Support

### TypeScript Types

```typescript
// Import enhanced types
import type {
  EnhancedSearchRequest,
  EnhancedSearchResponse,
  EnhancedFetchRequest,
  EnhancedFetchResponse,
  TransformationPipeline,
  RolloutStatus,
  MetricsSummary
} from 'attio-mcp/enhanced';

// Use with type safety
const searchRequest: EnhancedSearchRequest = {
  query: 'test',
  scoring: { enabled: true },
  cache: { enabled: true }
};
```

### JavaScript SDK

```javascript
const { AttioMCP } = require('attio-mcp');

const client = new AttioMCP({
  apiKey: process.env.ATTIO_API_KEY,
  features: {
    enableCache: true,
    enableRelevanceScoring: true
  }
});

// Automatic feature detection
const results = await client.search('John Doe', {
  useEnhancedFeatures: true  // Automatically uses available features
});
```

## Examples

### Example 1: Smart Search with Caching

```typescript
async function smartSearch(query: string) {
  const response = await fetch('/api/search', {
    method: 'POST',
    body: JSON.stringify({
      query,
      scoring: {
        enabled: true,
        fuzzyMatch: true,
        threshold: 0.7
      },
      cache: {
        enabled: true,
        ttl: 3600000
      },
      pagination: {
        limit: 10
      }
    })
  });
  
  const data = await response.json();
  
  // Use cache metrics for monitoring
  if (data.metrics?.cache_hit) {
    console.log('Cache hit! Saved API call');
  }
  
  return data.results;
}
```

### Example 2: Batch Processing with Transformation

```typescript
async function processBatchWithTransformation(ids: string[]) {
  const response = await fetch('/api/batch/fetch', {
    method: 'POST',
    body: JSON.stringify({
      ids,
      options: {
        transform: true,
        cache: true,
        include_related: true
      }
    })
  });
  
  const data = await response.json();
  
  // Handle partial failures
  if (data.errors?.length > 0) {
    console.warn('Some requests failed:', data.errors);
  }
  
  return data.results;
}
```

### Example 3: Real-time Monitoring

```typescript
function monitorPerformance() {
  const ws = new WebSocket('ws://localhost:3000/ws/metrics');
  
  ws.onmessage = (event) => {
    const metrics = JSON.parse(event.data);
    
    // Alert if latency is high
    if (metrics.data.latency.p95 > 1000) {
      alert('High latency detected!');
      
      // Disable expensive features
      fetch('/api/features/disable', {
        method: 'POST',
        body: JSON.stringify({
          features: ['enableRelevanceScoring']
        })
      });
    }
  };
}
```