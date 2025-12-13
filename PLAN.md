# FastAPI Optimization Plan

## Overview

This document outlines optimization recommendations for the FastAPI application based on codebase analysis.

---

## 1. Response Compression

### Current State

- No response compression middleware is configured
- Large responses (GLB files, depth maps, embeddings) are sent uncompressed

### Recommendations

- **Add GZip compression middleware** for all responses
- **Use Brotli compression** for better compression ratios (optional, requires additional dependency)
- **Exclude already-compressed files** (e.g., GLB files that may already be compressed)

### Implementation

```python
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)  # Compress responses > 1KB
```

### Expected Impact

- **30-70% reduction** in response sizes for JSON/text responses
- Faster API response times, especially for mobile/slow connections
- Reduced bandwidth costs

---

## 2. Database Connection Pooling

### Current State

```python
engine = create_async_engine(DATABASE_URL, echo=False)
```

- No connection pool configuration
- Default pool size may be insufficient for concurrent requests

### Recommendations

- **Configure connection pool size** based on expected load
- **Set pool timeout** to prevent connection exhaustion
- **Enable pool pre-ping** to detect stale connections
- **Configure max overflow** for burst traffic

### Implementation

```python
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,              # Base pool size
    max_overflow=20,           # Additional connections during bursts
    pool_pre_ping=True,        # Verify connections before use
    pool_recycle=3600,         # Recycle connections after 1 hour
    connect_args={"check_same_thread": False}  # For SQLite
)
```

### Expected Impact

- **Better handling of concurrent requests**
- **Reduced connection errors** under load
- **Improved response times** for database operations

---

## 3. Database Indexes

### Current State

- Basic indexes exist on `email`, `username` (unique constraints)
- No indexes on frequently queried fields like:
  - `UserActivity.user_id` (for filtering activities)
  - `UserActivity.created_at` (for time-based queries)
  - `User.plan` (for plan-based filtering)

### Recommendations

- **Add composite indexes** for common query patterns
- **Index foreign keys** for faster joins
- **Index timestamp fields** used in WHERE clauses

### Implementation

```python
# In models.py, add indexes:
class UserActivity(Base):
    # ... existing fields ...

    __table_args__ = (
        Index('idx_user_activity_user_created', 'user_id', 'created_at'),
        Index('idx_user_activity_action', 'action'),
    )

class User(Base):
    # ... existing fields ...

    __table_args__ = (
        Index('idx_user_plan_active', 'plan', 'is_active'),
    )
```

### Expected Impact

- **50-90% faster** queries on indexed fields
- **Reduced database load** for common queries
- **Better scalability** as data grows

---

## 4. Caching Strategy

### Current State

- **Furniture search service**: Loads entire CSV and embeddings into memory on first request
- **No caching** for:
  - User authentication lookups
  - Furniture search results
  - Product lookups by ASIN/brand
  - Job status queries

### Recommendations

#### A. In-Memory Caching (FastAPI-Cache2 or cachetools)

- Cache furniture search embeddings (already in memory, but could be optimized)
- Cache user lookups by ID/email (TTL: 5-15 minutes)
- Cache product lookups by ASIN (TTL: 1 hour)

#### B. Redis Caching (Production)

- Cache job status queries (TTL: 30 seconds)
- Cache furniture search results (TTL: 1 hour)
- Cache user sessions/tokens (if implementing token blacklisting)

### Implementation Example

```python
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.decorator import cache

@router.get("/furniture/product/{asin}")
@cache(expire=3600)  # Cache for 1 hour
async def get_product(asin: str):
    # ... existing code ...
```

### Expected Impact

- **80-95% reduction** in database queries for cached endpoints
- **Sub-millisecond response times** for cached data
- **Reduced load** on database and ML models

---

## 5. Database Query Optimization

### Current State

- Multiple separate queries in `auth_service.py`:
  - `get_user_by_email()` and `get_user_by_username()` are separate queries
  - `get_current_user()` makes a separate query after JWT validation
  - User activities are loaded separately (if needed)

### Recommendations

- **Combine queries** where possible
- **Use select_related/joinedload** for eager loading relationships
- **Batch queries** for multiple lookups
- **Add query result caching** for frequently accessed data

### Implementation

```python
# Instead of multiple queries:
async def get_user_by_email_or_username(db: AsyncSession, email: str = None, username: str = None):
    query = select(User)
    if email:
        query = query.where(User.email == email)
    elif username:
        query = query.where(User.username == username)
    result = await db.execute(query)
    return result.scalar_one_or_none()

# Eager load relationships when needed:
from sqlalchemy.orm import selectinload

async def get_user_with_activities(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(User)
        .options(selectinload(User.activities))
        .where(User.id == user_id)
    )
    return result.scalar_one_or_none()
```

### Expected Impact

- **30-50% reduction** in database round trips
- **Faster response times** for user-related endpoints
- **Reduced database connection usage**

---

## 6. Response Model Optimization

### Current State

- Full model serialization for all responses
- Large depth maps encoded as base64 in responses
- No pagination for list endpoints

### Recommendations

- **Use response_model_exclude** to exclude unnecessary fields
- **Implement pagination** for list endpoints (jobs, activities)
- **Stream large files** instead of loading into memory
- **Use response_model_exclude_none** to omit null values

### Implementation

```python
from fastapi import Query
from typing import Optional

@router.get("/admin/jobs")
async def list_jobs_on_disk(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100)
):
    jobs = get_job_directories()
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "jobs": jobs[start:end],
        "count": len(jobs),
        "page": page,
        "page_size": page_size,
        "total_pages": (len(jobs) + page_size - 1) // page_size
    }

# Exclude large fields from responses:
@router.get("/result/{job_id}", response_model_exclude={"frames"})
async def get_result_summary(job_id: str):
    # Return summary without full depth frames
    ...
```

### Expected Impact

- **50-80% reduction** in response payload sizes
- **Faster JSON serialization**
- **Better mobile/bandwidth-limited performance**

---

## 7. Request Timeout and Rate Limiting

### Current State

- No request timeout configuration
- No rate limiting middleware
- Large file uploads could block other requests

### Recommendations

- **Add request timeout middleware** (30-60 seconds for most endpoints)
- **Implement rate limiting** per IP/user
- **Separate rate limits** for different endpoint types:
  - Auth endpoints: 5 requests/minute
  - Upload endpoints: 2 requests/minute
  - Search endpoints: 30 requests/minute
  - General API: 100 requests/minute

### Implementation

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@router.post("/upload")
@limiter.limit("2/minute")
async def upload_video(...):
    ...

@router.post("/auth/login")
@limiter.limit("5/minute")
async def login(...):
    ...
```

### Expected Impact

- **Protection against abuse** and DoS attacks
- **Fair resource allocation** among users
- **Prevents resource exhaustion** from runaway requests

---

## 8. Background Task Queue

### Current State

- Uses FastAPI `BackgroundTasks` for video processing
- Jobs stored in-memory dictionary (lost on restart)
- No task persistence or retry mechanism

### Recommendations

- **Use Celery or RQ** for production background tasks
- **Persist job state** in database instead of memory
- **Implement task retry logic** with exponential backoff
- **Add job priority queues** (high priority for paid users)

### Implementation Options

#### Option A: Database-backed jobs (Simpler)

```python
# Create Job model in database
class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
    status = Column(String)  # uploaded, processing, completed, failed
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # ... other fields

# Store jobs in database instead of dict
```

#### Option B: Celery (Production-ready)

```python
from celery import Celery

celery_app = Celery("garaza", broker="redis://localhost:6379/0")

@celery_app.task(bind=True, max_retries=3)
def process_video_task(self, job_id: str, video_path: str):
    try:
        # ... processing logic ...
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

### Expected Impact

- **Job persistence** across server restarts
- **Better error handling** and retry logic
- **Scalability** with multiple workers
- **Monitoring** and job status tracking

---

## 9. Async File Operations

### Current State

- Some file operations may be blocking
- Large file uploads could benefit from streaming

### Recommendations

- **Use `aiofiles`** for all file I/O operations (already in requirements)
- **Stream large file uploads** instead of loading into memory
- **Use async file deletion** for cleanup operations

### Implementation

```python
import aiofiles
from fastapi import UploadFile

async def save_upload_file_async(file: UploadFile, dest: Path):
    async with aiofiles.open(dest, 'wb') as f:
        while chunk := await file.read(8192):  # 8KB chunks
            await f.write(chunk)
```

### Expected Impact

- **Non-blocking I/O** operations
- **Better concurrency** for multiple uploads
- **Reduced memory usage** for large files

---

## 10. Response Headers and Caching

### Current State

- No cache headers for static assets
- No ETag support for conditional requests

### Recommendations

- **Add cache headers** for static assets (GLB files, images)
- **Implement ETag support** for conditional GET requests
- **Add CORS preflight caching** headers

### Implementation

```python
from fastapi.responses import FileResponse
from pathlib import Path
import hashlib

@router.get("/assets/{job_id}/{file_path:path}")
async def get_job_asset(job_id: str, file_path: str):
    asset_path = (job_dir / file_path).resolve()

    # Generate ETag
    file_hash = hashlib.md5(asset_path.read_bytes()).hexdigest()
    etag = f'"{file_hash}"'

    # Check If-None-Match header
    if request.headers.get("If-None-Match") == etag:
        return Response(status_code=304)

    return FileResponse(
        str(asset_path),
        headers={
            "ETag": etag,
            "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
            "Cross-Origin-Resource-Policy": "cross-origin",
        }
    )
```

### Expected Impact

- **Reduced bandwidth** for repeated requests
- **Faster page loads** with cached assets
- **Better CDN integration** support

---

## 11. Database Query Logging and Monitoring

### Current State

- `echo=False` in database engine (no query logging)
- No query performance monitoring

### Recommendations

- **Enable slow query logging** in development
- **Add query timing middleware** to identify slow endpoints
- **Use SQLAlchemy query logging** for debugging
- **Add APM tools** (e.g., Sentry, DataDog) for production

### Implementation

```python
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)

        if process_time > 1.0:  # Log slow requests
            logger.warning(f"Slow request: {request.url} took {process_time:.2f}s")

        return response

app.add_middleware(TimingMiddleware)
```

### Expected Impact

- **Identify performance bottlenecks**
- **Monitor API response times**
- **Debug slow queries** in development

---

## 12. Furniture Search Service Optimization

### Current State

- Loads entire CSV into memory on first request
- Creates embeddings for all products on initialization
- No caching of search results

### Recommendations

- **Lazy load embeddings** (create on-demand or in background)
- **Use vector database** (e.g., Qdrant, Pinecone) for large-scale search
- **Cache search results** by query hash
- **Implement search result pagination**

### Implementation

```python
# Use vector database for better scalability
from qdrant_client import QdrantClient

class FurnitureSearchService:
    def __init__(self):
        self.qdrant_client = QdrantClient("localhost", port=6333)
        self.collection_name = "furniture_products"

    def search(self, query: str, top_k: int = 3):
        query_embedding = self.embedding_model.encode(query)
        results = self.qdrant_client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            limit=top_k
        )
        return results
```

### Expected Impact

- **Faster search** for large product catalogs
- **Better scalability** (millions of products)
- **Reduced memory usage**

---

## 13. WebSocket Optimization

### Current State

- WebSocket router exists but implementation not fully reviewed

### Recommendations

- **Use connection pooling** for WebSocket connections
- **Implement heartbeat/ping-pong** to detect dead connections
- **Add message queuing** for offline clients
- **Limit concurrent connections** per user

---

## 14. Security Optimizations

### Current State

- JWT tokens with long expiration (7 days)
- No token refresh mechanism
- No token blacklisting

### Recommendations

- **Implement refresh tokens** with shorter access token lifetime
- **Add token blacklisting** for logout/security incidents
- **Rate limit authentication endpoints** more aggressively
- **Add request signing** for sensitive operations

---

## Priority Ranking

### High Priority (Immediate Impact)

1. **Response Compression** - Easy to implement, significant impact
2. **Database Connection Pooling** - Critical for production
3. **Database Indexes** - Quick win, improves query performance
4. **Response Model Optimization** - Reduces payload sizes

### Medium Priority (Important for Scale)

5. **Caching Strategy** - Reduces load on database/ML models
6. **Database Query Optimization** - Improves response times
7. **Background Task Queue** - Better job management
8. **Request Timeout and Rate Limiting** - Protects against abuse

### Low Priority (Nice to Have)

9. **Async File Operations** - Already mostly async
10. **Response Headers and Caching** - Improves client-side performance
11. **Query Logging and Monitoring** - Development/debugging tool
12. **Furniture Search Optimization** - Only needed at scale
13. **WebSocket Optimization** - Depends on usage
14. **Security Optimizations** - Important but not performance-critical

---

## Implementation Order

1. **Week 1**: Response compression, database pooling, indexes
2. **Week 2**: Caching strategy, query optimization, response models
3. **Week 3**: Background task queue, rate limiting
4. **Week 4**: Monitoring, async file ops, response headers

---

## Expected Overall Impact

- **API Response Time**: 30-50% improvement
- **Database Load**: 40-60% reduction
- **Bandwidth Usage**: 50-70% reduction
- **Concurrent Request Capacity**: 2-3x improvement
- **Server Resource Usage**: 20-30% reduction

---

## Notes

- Test each optimization in isolation
- Monitor performance metrics before/after
- Some optimizations may require infrastructure changes (Redis, Celery)
- Consider using APM tools (Sentry, DataDog) for production monitoring
