import { useState, useCallback, useEffect } from 'react'
import { searchFurniture, getFurnitureFilters, FurnitureProduct, FilterOption } from '../services/api'

// Get flag image URL from CDN (works on all platforms including Windows)
function getFlagUrl(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return ''
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

// Product image component with loading state and fallback
function ProductImage({ url, alt }: { url?: string; alt: string }) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const showImage = url && url !== 'N/A' && !hasError

  return (
    <div className="w-16 h-16 rounded-md bg-accent flex-shrink-0 flex items-center justify-center overflow-hidden relative">
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
        <svg className="w-6 h-6 text-muted-foreground absolute" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )}
    </div>
  )
}

interface FurnitureSearchProps {
  onProductSelect?: (product: FurnitureProduct) => void
  initialQuery?: string // Pre-fill search from detected furniture
}

// Static filter options
const CATEGORIES = ['Chair', 'Table', 'Desk', 'Sofa', 'Bed', 'Lamp', 'Shelf', 'Cabinet']
const STYLES = ['Modern', 'Minimalist', 'Industrial', 'Rustic', 'Scandinavian', 'Mid-century']
const MATERIALS = ['Wood', 'Metal', 'Fabric', 'Leather', 'Glass', 'Plastic']

export default function FurnitureSearch({ onProductSelect, initialQuery }: FurnitureSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FurnitureProduct[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [userCountry, setUserCountry] = useState<string | undefined>()
  const [userCountryCode, setUserCountryCode] = useState<string | undefined>()
  const [availableBrands, setAvailableBrands] = useState<FilterOption[]>([])
  const [availableCountries, setAvailableCountries] = useState<FilterOption[]>([])
  const [filters, setFilters] = useState({
    brand: '',
    country: '',
    category: '',
    style: '',
    material: '',
  })

  // Fetch filter options and user location on mount
  useEffect(() => {
    // Fetch available brands and countries
    getFurnitureFilters()
      .then(data => {
        setAvailableBrands(data.brands)
        setAvailableCountries(data.countries)
      })
      .catch(err => console.error('Failed to fetch filters:', err))

    // Get user's country via IP geolocation (free API)
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data.country_name) {
          setUserCountry(data.country_name)
          setUserCountryCode(data.country_code)
          console.log('User country detected:', data.country_name, data.country_code)
        }
      })
      .catch(err => console.error('Failed to detect location:', err))
  }, [])

  // Handle initial query from detected furniture (auto-search)
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setQuery(initialQuery)
      // Trigger search after setting query - use setTimeout to ensure state is updated
      const searchWithQuery = async () => {
        setIsLoading(true)
        setError(null)
        setHasSearched(true)
        try {
          console.log('Auto-searching for detected furniture:', initialQuery)
          const response = await searchFurniture(initialQuery, 5, userCountry)
          setResults(response.results)
        } catch (err) {
          console.error('Search error:', err)
          const errorMessage = err instanceof Error ? err.message : 'Search failed'
          setError(errorMessage)
          setResults([])
        } finally {
          setIsLoading(false)
        }
      }
      searchWithQuery()
    }
  }, [initialQuery, userCountry])

  // Build the full query with filters
  const buildSearchQuery = useCallback(() => {
    const parts = [query.trim()]
    if (filters.brand) parts.push(filters.brand)
    if (filters.country) parts.push(`from ${filters.country}`)
    if (filters.category) parts.push(filters.category)
    if (filters.style) parts.push(filters.style)
    if (filters.material) parts.push(filters.material)
    return parts.join(' ')
  }, [query, filters])

  const handleSearch = useCallback(async () => {
    const searchQuery = buildSearchQuery()
    if (!searchQuery.trim()) return

    setIsLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      console.log('Searching for:', searchQuery, 'User country:', userCountry)
      const response = await searchFurniture(searchQuery, 5, userCountry)
      console.log('Search response:', response)
      setResults(response.results)
    } catch (err) {
      console.error('Search error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Search failed'
      setError(errorMessage)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [buildSearchQuery, userCountry])

  const activeFiltersCount = [filters.brand, filters.country, filters.category, filters.style, filters.material].filter(Boolean).length

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const formatPrice = (price: string) => {
    if (!price || price === 'N/A') return 'Price unavailable'
    return price.startsWith('$') ? price : `$${price}`
  }

  const getAvailabilityColor = (availability: string) => {
    if (availability?.toLowerCase().includes('in stock')) {
      return 'text-green-500 bg-green-500/10'
    }
    return 'text-muted-foreground bg-muted'
  }

  return (
    <div className="w-full min-h-[420px] sm:min-h-[480px] flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground select-none">Furniture Search</h3>
              <p className="text-[11px] text-muted-foreground">
                Find furniture with AI{userCountry ? ` · ${userCountry}` : ''}
              </p>
            </div>
          </div>
          {userCountryCode && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md" title={`Boosting results from ${userCountry}`}>
              <img
                src={getFlagUrl(userCountryCode)}
                alt={userCountry || ''}
                className="w-6 h-4 object-cover rounded-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., modern black office chair..."
          className="w-full px-4 py-2.5 pr-12 bg-muted border border-border rounded-lg text-foreground
                     placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30
                     focus:border-brand/50 transition-all text-sm"
        />
        <button
          onClick={handleSearch}
          disabled={isLoading || (!query.trim() && activeFiltersCount === 0)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md
                     text-muted-foreground hover:text-foreground hover:bg-accent
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Search"
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </button>
      </div>

      {/* Filter Toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
            showFilters || activeFiltersCount > 0
              ? 'bg-brand/20 text-brand-300'
              : 'bg-accent text-muted-foreground hover:text-foreground'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFiltersCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-brand text-white text-[10px] flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
        {activeFiltersCount > 0 && (
          <button
            onClick={() => setFilters({ brand: '', country: '', category: '', style: '', material: '' })}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="mb-3 p-3 bg-accent/50 rounded-lg space-y-3 animate-fade-in max-h-[280px] overflow-y-auto">
          {/* Brand (First - Monetizable) */}
          {availableBrands.length > 0 && (
            <div>
              <label className="text-[10px] font-medium text-brand-300 uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Brand (Partner)
              </label>
              <select
                value={filters.brand}
                onChange={(e) => setFilters(f => ({ ...f, brand: e.target.value }))}
                className="w-full px-2 py-1.5 text-[11px] bg-muted border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-brand/30"
              >
                <option value="">All Brands</option>
                {availableBrands.slice(0, 20).map((brand) => (
                  <option key={brand.name} value={brand.name}>
                    {brand.name} ({brand.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Country */}
          {availableCountries.length > 0 && (
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Country of Origin
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableCountries.map((country) => (
                  <button
                    key={country.name}
                    onClick={() => setFilters(f => ({ ...f, country: f.country === country.name ? '' : country.name }))}
                    className={`px-2 py-1 text-[11px] rounded transition-colors ${
                      filters.country === country.name
                        ? 'bg-brand text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {country.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilters(f => ({ ...f, category: f.category === cat ? '' : cat }))}
                  className={`px-2 py-1 text-[11px] rounded transition-colors ${
                    filters.category === cat
                      ? 'bg-brand text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Style</label>
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => setFilters(f => ({ ...f, style: f.style === style ? '' : style }))}
                  className={`px-2 py-1 text-[11px] rounded transition-colors ${
                    filters.style === style
                      ? 'bg-brand text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Material */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Material</label>
            <div className="flex flex-wrap gap-1.5">
              {MATERIALS.map((mat) => (
                <button
                  key={mat}
                  onClick={() => setFilters(f => ({ ...f, material: f.material === mat ? '' : mat }))}
                  className={`px-2 py-1 text-[11px] rounded transition-colors ${
                    filters.material === mat
                      ? 'bg-brand text-white'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search suggestions */}
      {!hasSearched && (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">Try searching for:</p>
          <div className="flex flex-wrap gap-2">
            {['minimalist desk lamp', 'ergonomic office chair', 'wooden bookshelf'].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setQuery(suggestion)
                }}
                className="px-3 py-1.5 text-xs bg-accent hover:bg-accent/80 text-muted-foreground
                           hover:text-foreground rounded-full transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs animate-fade-in">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <svg className="w-8 h-8 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-xs">Searching furniture...</p>
          </div>
        )}

        {!isLoading && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground animate-fade-in">
            <svg className="w-10 h-10 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium mb-1">No results found</p>
            <p className="text-xs">Try different keywords</p>
          </div>
        )}

        {!isLoading && results.length > 0 && (
          <div className="space-y-3">
            {results.map((product, index) => (
              <div
                key={product.asin}
                onClick={() => onProductSelect?.(product)}
                className={`group p-3 rounded-lg border transition-all duration-200 cursor-pointer animate-slide-up ${
                  product.is_sponsored
                    ? 'bg-gradient-to-r from-amber-500/5 to-transparent border-amber-500/30 hover:border-amber-500/50'
                    : 'bg-muted/50 border-border/50 hover:border-brand/30 hover:bg-muted'
                }`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Sponsored badge */}
                {product.is_sponsored && (
                  <div className="flex items-center gap-1 mb-2">
                    <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-[10px] font-medium text-amber-500">
                      {product.sponsor_tier === 'premium' ? 'Premium Partner' : 'Sponsored'}
                    </span>
                  </div>
                )}
                <div className="flex gap-3">
                  {/* Product image */}
                  <ProductImage url={product.imgUrl} alt={product.title} />

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-brand-300 transition-colors">
                      {product.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{product.brand}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        {formatPrice(product.price)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${getAvailabilityColor(product.availability)}`}>
                        {product.availability?.includes('In Stock') ? 'In Stock' : 'Check Availability'}
                      </span>
                    </div>
                  </div>

                  {/* Match score */}
                  <div className="flex-shrink-0 flex flex-col items-end">
                    <div className="text-[10px] text-muted-foreground">Match</div>
                    <div className="text-sm font-semibold text-brand-300">
                      {Math.round(product.similarity_score * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state when not searched */}
        {!hasSearched && !isLoading && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <div className="w-16 h-16 rounded-xl bg-accent/50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-sm font-medium mb-1">Find the perfect furniture</p>
            <p className="text-xs text-center max-w-[200px]">
              Search using natural language to find furniture that matches your style
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
