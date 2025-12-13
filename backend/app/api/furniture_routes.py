from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.furniture_search_service import furniture_search_service

router = APIRouter(prefix="/furniture", tags=["furniture"])

# Pydantic models
class SearchRequest(BaseModel):
    query: str
    top_k: int = 3

class ProductResult(BaseModel):
    rank: int
    title: str
    brand: str
    price: str
    availability: str
    categories: str
    similarity_score: float
    asin: str
    url: Optional[str] = None

class SearchResponse(BaseModel):
    query: str
    results: List[ProductResult]
    count: int

# Search endpoint
@router.post("/search", response_model=SearchResponse)
async def search_furniture(request: SearchRequest):
    """Search for furniture products using semantic similarity."""
    try:
        if not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        if request.top_k < 1 or request.top_k > 10:
            raise HTTPException(status_code=400, detail="top_k must be between 1 and 10")

        results = furniture_search_service.search(request.query, request.top_k)

        formatted_results = [
            ProductResult(
                rank=r.get('rank'),
                title=r.get('title', 'N/A'),
                brand=r.get('brand', 'N/A'),
                price=r.get('price', 'N/A'),
                availability=r.get('availability', 'N/A'),
                categories=str(r.get('categories', 'N/A')),
                similarity_score=r.get('similarity_score', 0),
                asin=r.get('asin', 'N/A'),
                url=r.get('url', None)
            )
            for r in results
        ]

        return SearchResponse(
            query=request.query,
            results=formatted_results,
            count=len(formatted_results)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/product/{asin}")
async def get_product(asin: str):
    """Get product details by ASIN."""
    try:
        product = furniture_search_service.get_product_by_asin(asin)
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        return product
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/brand/{brand}")
async def get_by_brand(brand: str, limit: int = 10):
    """Get products by brand."""
    try:
        products = furniture_search_service.get_products_by_brand(brand, limit)
        
        if not products:
            raise HTTPException(status_code=404, detail="No products found for this brand")

        return {
            "brand": brand,
            "count": len(products),
            "products": products
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats")
async def get_stats():
    """Get search service statistics."""
    try:
        return furniture_search_service.get_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health():
    """Check if furniture search service is healthy."""
    return {
        "status": "healthy" if furniture_search_service.is_initialized() else "initializing",
        "initialized": furniture_search_service.is_initialized()
    }