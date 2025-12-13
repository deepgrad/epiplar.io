import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional
import logging
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)


class FurnitureSearchService:
    """Service for semantic furniture product search."""

    def __init__(self, csv_path: str = "data.csv"): # TBD
        """Initialize the search service with product data."""
        self.csv_path = csv_path
        self.df = None
        self.embedding_model = None
        self.product_embeddings = None
        self._initialized = False

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

    def search(self, query: str, top_k: int = 3) -> list[dict]:
        """
        Search for furniture products using semantic similarity.

        Args:
            query: Search query (e.g., "black office chairs")
            top_k: Number of top results to return (default: 3, max: 10)

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

        logger.info(f"Searching for: '{query}' (top_k={top_k})")

        # Embed the query
        query_embedding = self.embedding_model.encode(query, convert_to_numpy=True)

        # Calculate similarity scores
        similarities = cosine_similarity([query_embedding], self.product_embeddings)[0]

        # Get top K indices
        top_indices = np.argsort(similarities)[::-1][:top_k]

        # Prepare results
        results = []
        for rank, idx in enumerate(top_indices, 1):
            product = self.df.iloc[idx].to_dict()
            product['rank'] = rank
            product['similarity_score'] = float(similarities[idx])
            results.append(product)

        logger.info(f"Found {len(results)} results")
        return results

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

    def is_initialized(self) -> bool:
        """Check if service is initialized."""
        return self._initialized


# Singleton instance
furniture_search_service = FurnitureSearchService()