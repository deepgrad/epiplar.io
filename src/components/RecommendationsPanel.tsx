import { useState, useCallback, useEffect } from 'react'
import { searchFurniture, FurnitureProduct } from '../services/api'

// Category definitions with search keywords
const FURNITURE_CATEGORIES = [
  { id: 'chairs', label: 'Chairs', keywords: ['chair', 'seating'] },
  { id: 'tables', label: 'Tables', keywords: ['table', 'desk'] },
  { id: 'lighting', label: 'Lighting', keywords: ['lamp', 'light'] },
  { id: 'storage', label: 'Storage', keywords: ['shelf', 'cabinet', 'organizer', 'rack'] },
  { id: 'sofas', label: 'Sofas', keywords: ['sofa', 'couch'] },
  { id: 'decor', label: 'Decor', keywords: ['mat', 'rug', 'decor'] },
] as const

type CategoryId = typeof FURNITURE_CATEGORIES[number]['id']

// Product image component with loading state and fallback
function ProductImage({ url, alt }: { url?: string; alt: string }) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const showImage = url && url !== 'N/A' && !hasError

  return (
    <div className="aspect-square rounded-lg bg-accent flex items-center justify-center overflow-hidden relative">
      {showImage && (
        <img
          src={url}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setHasError(true)
            setIsLoading(false)
          }}
        />
      )}
      {(!showImage || isLoading) && (
        <svg className="w-8 h-8 text-muted-foreground absolute" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )}
    </div>
  )
}

// Loading skeleton for product cards
function ProductSkeleton() {
  return (
    <div className="bg-muted/50 rounded-xl p-3 animate-pulse">
      <div className="aspect-square rounded-lg bg-accent mb-2" />
      <div className="h-3 bg-accent rounded w-3/4 mb-1" />
      <div className="h-2 bg-accent rounded w-1/2 mb-2" />
      <div className="h-7 bg-accent rounded" />
    </div>
  )
}

interface RecommendationsPanelProps {
  onAddToScene: (product: FurnitureProduct) => void
  className?: string
}

export default function RecommendationsPanel({ onAddToScene, className = '' }: RecommendationsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('chairs')
  const [products, setProducts] = useState<FurnitureProduct[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingProductId, setAddingProductId] = useState<string | null>(null)

  // Fetch products when category changes
  const fetchProducts = useCallback(async (category: CategoryId) => {
    const categoryDef = FURNITURE_CATEGORIES.find(c => c.id === category)
    if (!categoryDef) return

    setIsLoading(true)
    setError(null)

    try {
      // Use the first keyword for search
      const query = categoryDef.keywords[0]
      const response = await searchFurniture(query, 8)
      setProducts(response.results)
    } catch (err) {
      console.error('Failed to fetch products:', err)
      setError(err instanceof Error ? err.message : 'Failed to load products')
      setProducts([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount and category change
  useEffect(() => {
    fetchProducts(activeCategory)
  }, [activeCategory, fetchProducts])

  // Handle adding product to scene
  const handleAddToScene = useCallback(async (product: FurnitureProduct) => {
    setAddingProductId(product.asin)
    try {
      onAddToScene(product)
    } finally {
      // Short delay to show feedback
      setTimeout(() => setAddingProductId(null), 500)
    }
  }, [onAddToScene])

  const formatPrice = (price: string) => {
    if (!price || price === 'N/A') return 'Price N/A'
    return price.startsWith('$') ? price : `$${price}`
  }

  return (
    <div className={`bg-muted/50 border border-border rounded-xl flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add Furniture</h3>
            <p className="text-[11px] text-muted-foreground">Browse and add items to your scene</p>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1 scrollbar-thin">
          {FURNITURE_CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeCategory === category.id
                  ? 'bg-brand text-white'
                  : 'bg-accent text-muted-foreground hover:text-foreground hover:bg-accent/80'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Products grid */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {/* Error state */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs mb-4">
            {error}
            <button
              onClick={() => fetchProducts(activeCategory)}
              className="ml-2 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Products */}
        {!isLoading && products.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => (
              <div
                key={product.asin}
                className="bg-muted/50 border border-border/50 rounded-xl p-3 hover:border-brand/30 transition-colors"
              >
                <ProductImage url={product.imgUrl} alt={product.title} />
                <h4 className="text-xs font-medium text-foreground line-clamp-2 mt-2 min-h-[2rem]">
                  {product.title}
                </h4>
                <p className="text-[10px] text-muted-foreground truncate">{product.brand}</p>
                <p className="text-xs font-semibold text-foreground mt-1">{formatPrice(product.price)}</p>
                <button
                  onClick={() => handleAddToScene(product)}
                  disabled={addingProductId === product.asin}
                  className={`w-full mt-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    addingProductId === product.asin
                      ? 'bg-green-500 text-white'
                      : 'bg-brand hover:bg-brand/90 text-white'
                  }`}
                >
                  {addingProductId === product.asin ? (
                    <span className="flex items-center justify-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Added!
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add to Scene
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm font-medium mb-1">No products found</p>
            <p className="text-xs text-center">Try a different category</p>
          </div>
        )}
      </div>
    </div>
  )
}
