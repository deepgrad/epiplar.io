from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import math
from ..services.furniture_search import furniture_search_service


def safe_str(value, default: str = 'N/A') -> str:
    """Convert value to string, handling NaN and None."""
    if value is None:
        return default
    if isinstance(value, float) and math.isnan(value):
        return default
    return str(value)

def parse_images(value) -> Optional[List[str]]:
    """Parse images string to list of URLs."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    try:
        # The images are stored as a string like "['url1', 'url2', ...]"
        import ast
        images = ast.literal_eval(str(value))
        if isinstance(images, list):
            return [img.strip() for img in images if img and img.strip()]
    except:
        pass
    return None

router = APIRouter(prefix="/furniture", tags=["furniture"])

# Pydantic models
class SearchRequest(BaseModel):
    query: str
    top_k: int = 3
    user_country: Optional[str] = None  # For location-based boosting

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
    imgUrl: Optional[str] = None
    images: Optional[List[str]] = None
    country: Optional[str] = None
    is_sponsored: bool = False
    sponsor_tier: Optional[str] = None

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

        results = furniture_search_service.search(
            request.query,
            request.top_k,
            user_country=request.user_country
        )

        formatted_results = [
            ProductResult(
                rank=r.get('rank'),
                title=safe_str(r.get('title'), 'N/A'),
                brand=safe_str(r.get('brand'), 'N/A'),
                price=safe_str(r.get('price'), 'N/A'),
                availability=safe_str(r.get('availability'), 'N/A'),
                categories=safe_str(r.get('categories'), 'N/A'),
                similarity_score=r.get('similarity_score', 0),
                asin=safe_str(r.get('asin'), 'N/A'),
                url=safe_str(r.get('url'), None) if r.get('url') else None,
                imgUrl=safe_str(r.get('primary_image'), None) if r.get('primary_image') else None,
                images=parse_images(r.get('images')),
                country=safe_str(r.get('country_of_origin'), None) if r.get('country_of_origin') else None,
                is_sponsored=r.get('is_sponsored', False),
                sponsor_tier=r.get('sponsor_tier')
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

@router.get("/filters")
async def get_filters():
    """Get available filter options (brands and countries)."""
    try:
        return furniture_search_service.get_filter_options()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health():
    """Check if furniture search service is healthy."""
    return {
        "status": "healthy" if furniture_search_service.is_initialized() else "initializing",
        "initialized": furniture_search_service.is_initialized()
    }

@router.get("/test")
async def test():
    """Simple test endpoint to verify router is working."""
    from ..services.furniture_search import DATA_CSV_PATH
    import os
    return {
        "router": "working",
        "csv_path": str(DATA_CSV_PATH),
        "csv_exists": os.path.exists(str(DATA_CSV_PATH))
    }