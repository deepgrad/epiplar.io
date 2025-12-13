import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional
import logging
import os
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

# Sponsored/Partner brands - these get boosted in search results
# In production, this would come from a database
SPONSORED_BRANDS = {
    'Boss Office Products Store': {'boost': 1.5, 'tier': 'premium'},
    'Kingston Brass Store': {'boost': 1.4, 'tier': 'premium'},
    'Table-Mate Store': {'boost': 1.3, 'tier': 'standard'},
    'LOVMOR': {'boost': 1.3, 'tier': 'standard'},
    'subrtex': {'boost': 1.25, 'tier': 'standard'},
    'Lerliuo Store': {'boost': 1.2, 'tier': 'basic'},
    'Chief Store': {'boost': 1.2, 'tier': 'basic'},
}

# Get the path relative to the backend directory
# When running from backend/, the data is at ../data/data.csv
BACKEND_DIR = Path(__file__).parent.parent.parent  # backend/app/services -> backend
DATA_CSV_PATH = BACKEND_DIR.parent / "data" / "data.csv"  # project_root/data/data.csv


class FurnitureSearchService:
    """Service for semantic furniture product search."""

    def __init__(self, csv_path: str = None):
        """Initialize the search service with product data."""
        self.csv_path = csv_path or str(DATA_CSV_PATH)
        self.df = None
        self.embedding_model = None
        self.product_embeddings = None
        self._initialized = False
        logger.info(f"FurnitureSearchService will use CSV at: {self.csv_path}")

    def _ensure_initialized(self):
        """Lazy initialization of models and data."""
        if self._initialized:
            return

        logger.info("Initializing FurnitureSearchService...")
        
        # Load CSV
        logger.info(f"Loading furniture dataset from {self.csv_path}")
        self.df = pd.read_csv(self.csv_path)
        logger.info(f"Loaded {len(self.df)} products")

        # Load embedding model
        logger.info("Loading embedding model (all-MiniLM-L6-v2)...")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

        # Create embeddings
        logger.info("Creating product embeddings...")
        self.product_embeddings = self._create_embeddings()
        
        self._initialized = True
        logger.info("FurnitureSearchService initialized successfully")

    def _create_embeddings(self) -> np.ndarray:
        """Create semantic embeddings for all products."""
        product_texts = []
        for _, row in self.df.iterrows():
            text = f"{row.get('title', '')} {row.get('brand', '')} {row.get('categories', '')}"
            product_texts.append(text)

        embeddings = self.embedding_model.encode(product_texts, convert_to_numpy=True)
        return embeddings

    def search(self, query: str, top_k: int = 3, user_country: str = None) -> list[dict]:
        """
        Search for furniture products using semantic similarity.

        Args:
            query: Search query (e.g., "black office chairs")
            top_k: Number of top results to return (default: 3, max: 10)
            user_country: User's country for location-based boosting

        Returns:
            List of product dictionaries with similarity scores
        """
        self._ensure_initialized()

        if not query.strip():
            logger.warning("Empty search query")
            return []

        if top_k < 1 or top_k > 10:
            logger.warning(f"Invalid top_k: {top_k}, clamping to [1, 10]")
            top_k = max(1, min(10, top_k))

        logger.info(f"Searching for: '{query}' (top_k={top_k}, user_country={user_country})")

        # Embed the query
        query_embedding = self.embedding_model.encode(query, convert_to_numpy=True)

        # Calculate similarity scores
        similarities = cosine_similarity([query_embedding], self.product_embeddings)[0]

        # Apply location-based boosting if user_country is provided
        if user_country:
            country_boost = self._get_country_boost(user_country)
            similarities = similarities * country_boost

        # Apply sponsored brand boosting
        sponsor_boost = self._get_sponsor_boost()
        similarities = similarities * sponsor_boost

        # Get top K indices
        top_indices = np.argsort(similarities)[::-1][:top_k]

        # Prepare results
        results = []
        for rank, idx in enumerate(top_indices, 1):
            product = self.df.iloc[idx].to_dict()
            product['rank'] = rank
            product['similarity_score'] = float(similarities[idx])

            # Add sponsor info if applicable
            brand = product.get('brand', '')
            if brand in SPONSORED_BRANDS:
                product['is_sponsored'] = True
                product['sponsor_tier'] = SPONSORED_BRANDS[brand]['tier']
            else:
                product['is_sponsored'] = False
                product['sponsor_tier'] = None

            results.append(product)

        logger.info(f"Found {len(results)} results")
        return results

    def _get_country_boost(self, user_country: str) -> np.ndarray:
        """
        Calculate boost factors based on user's country.
        Products from nearby/same region get higher scores.
        """
        # Define region mappings for proximity boosting
        regions = {
            'North America': ['United States', 'USA', 'Canada', 'Mexico'],
            'Europe': ['Germany', 'France', 'UK', 'Italy', 'Spain', 'Netherlands', 'Poland'],
            'Asia': ['China', 'Japan', 'Korea', 'Vietnam', 'Taiwan', 'India', 'Thailand', 'Indonesia'],
        }

        # Find user's region
        user_region = None
        for region, countries in regions.items():
            if user_country in countries:
                user_region = region
                break

        # Calculate boost factors
        boost = np.ones(len(self.df))
        countries = self.df['country_of_origin'].fillna('')

        for i, country in enumerate(countries):
            if not country:
                continue
            # Same country = 20% boost
            if country.lower() == user_country.lower():
                boost[i] = 1.2
            # Same region = 10% boost
            elif user_region:
                for region, region_countries in regions.items():
                    if country in region_countries and region == user_region:
                        boost[i] = 1.1
                        break

        return boost

    def _get_sponsor_boost(self) -> np.ndarray:
        """
        Calculate boost factors for sponsored brands.
        Premium sponsors get higher boost.
        """
        boost = np.ones(len(self.df))
        brands = self.df['brand'].fillna('')

        for i, brand in enumerate(brands):
            if brand in SPONSORED_BRANDS:
                boost[i] = SPONSORED_BRANDS[brand]['boost']

        return boost

    def get_product_by_asin(self, asin: str) -> Optional[dict]:
        """
        Get a specific product by ASIN.

        Args:
            asin: Product ASIN identifier

        Returns:
            Product dictionary or None if not found
        """
        self._ensure_initialized()

        product = self.df[self.df['asin'] == asin]
        if product.empty:
            logger.warning(f"Product not found: {asin}")
            return None

        return product.iloc[0].to_dict()

    def get_products_by_brand(self, brand: str, limit: int = 10) -> list[dict]:
        """
        Get products by brand.

        Args:
            brand: Brand name
            limit: Maximum number of products to return

        Returns:
            List of product dictionaries
        """
        self._ensure_initialized()

        products = self.df[self.df['brand'] == brand].head(limit)
        return [product.to_dict() for _, product in products.iterrows()]

    def get_products_by_category(self, category: str, limit: int = 10) -> list[dict]:
        """
        Get products by category.

        Args:
            category: Category name
            limit: Maximum number of products to return

        Returns:
            List of product dictionaries
        """
        self._ensure_initialized()

        # Categories are stored as strings like "['Home & Kitchen', 'Furniture', ...]"
        products = self.df[self.df['categories'].str.contains(category, case=False, na=False)].head(limit)
        return [product.to_dict() for _, product in products.iterrows()]

    def get_stats(self) -> dict:
        """
        Get search service statistics.

        Returns:
            Dictionary with service stats
        """
        self._ensure_initialized()

        return {
            "total_products": len(self.df),
            "unique_brands": int(self.df['brand'].nunique()),
            "unique_categories": int(self.df['categories'].nunique()),
            "products_with_price": int(self.df['price'].notna().sum()),
            "products_in_stock": int(self.df['availability'].str.contains('In Stock', case=False, na=False).sum()),
        }

    def get_filter_options(self) -> dict:
        """
        Get available filter options (brands and countries).

        Returns:
            Dictionary with brands and countries lists
        """
        self._ensure_initialized()

        # Get unique brands, sorted by product count (most products first)
        brand_counts = self.df['brand'].value_counts()
        brands = [
            {"name": brand, "count": int(count)}
            for brand, count in brand_counts.head(50).items()
            if pd.notna(brand) and brand
        ]

        # Get unique countries, sorted by product count
        country_counts = self.df['country_of_origin'].value_counts()
        countries = [
            {"name": country, "count": int(count)}
            for country, count in country_counts.items()
            if pd.notna(country) and country
        ]

        return {
            "brands": brands,
            "countries": countries
        }

    def is_initialized(self) -> bool:
        """Check if service is initialized."""
        return self._initialized


# Singleton instance
furniture_search_service = FurnitureSearchService()