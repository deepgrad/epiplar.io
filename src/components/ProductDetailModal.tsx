import { useState } from 'react'
import { FurnitureProduct } from '../services/api'

// Product image component with loading state
function ProductImage({ url, alt, className = '' }: { url?: string; alt: string; className?: string }) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const showImage = url && url !== 'N/A' && !hasError

  return (
    <div className={`bg-muted flex items-center justify-center overflow-hidden relative ${className}`}>
      {showImage && (
        <img
          src={url}
          alt={alt}
          className={`w-full h-full object-contain transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setHasError(true)
            setIsLoading(false)
          }}
        />
      )}
      {(!showImage || isLoading) && (
        <svg className="w-16 h-16 text-muted-foreground absolute" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )}
    </div>
  )
}

// Small product thumbnail
function ProductThumbnail({ url, alt }: { url?: string; alt: string }) {
  const [hasError, setHasError] = useState(false)

  const showImage = url && url !== 'N/A' && !hasError

  return (
    <div className="w-16 h-16 rounded-md bg-accent overflow-hidden flex-shrink-0 flex items-center justify-center">
      {showImage ? (
        <img
          src={url}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )}
    </div>
  )
}

interface ProductDetailModalProps {
  product: FurnitureProduct | null
  isOpen: boolean
  onClose: () => void
}

type PurchaseStep = 'details' | 'shipping' | 'payment' | 'confirmation'

export default function ProductDetailModal({ product, isOpen, onClose }: ProductDetailModalProps) {
  const [step, setStep] = useState<PurchaseStep>('details')
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [shippingInfo, setShippingInfo] = useState({
    fullName: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    phone: '',
  })
  const [isProcessing, setIsProcessing] = useState(false)

  // Get all images (primary + additional)
  const allImages = product ? [
    product.imgUrl,
    ...(product.images || [])
  ].filter((img): img is string => !!img && img !== 'N/A') : []

  if (!isOpen || !product) return null

  const formatPrice = (price: string) => {
    if (!price || price === 'N/A') return 'Price unavailable'
    return price.startsWith('$') ? price : `$${price}`
  }

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep('payment')
  }

  const handlePayment = async () => {
    setIsProcessing(true)
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsProcessing(false)
    setStep('confirmation')
  }

  const handleClose = () => {
    setStep('details')
    setSelectedImageIndex(0)
    setShippingInfo({
      fullName: '',
      address: '',
      city: '',
      postalCode: '',
      country: '',
      phone: '',
    })
    onClose()
  }

  const getAvailabilityInfo = (availability: string) => {
    if (availability?.toLowerCase().includes('in stock')) {
      return { text: 'In Stock', color: 'text-green-500 bg-green-500/10' }
    }
    if (availability?.toLowerCase().includes('left in stock')) {
      return { text: availability, color: 'text-yellow-500 bg-yellow-500/10' }
    }
    return { text: 'Check Availability', color: 'text-muted-foreground bg-muted' }
  }

  const availabilityInfo = getAvailabilityInfo(product.availability)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-background/80 hover:bg-background
                     text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="overflow-y-auto max-h-[90vh]">
          {step === 'details' && (
            <div className="p-6">
              {/* Main Product Image */}
              <ProductImage
                url={allImages[selectedImageIndex] || product.imgUrl}
                alt={product.title}
                className="aspect-video rounded-xl mb-3"
              />

              {/* Image Thumbnails */}
              {allImages.length > 1 && (
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {allImages.map((img, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        selectedImageIndex === index
                          ? 'border-brand ring-2 ring-brand/30'
                          : 'border-border hover:border-brand/50'
                      }`}
                    >
                      <img
                        src={img}
                        alt={`${product.title} ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Product Info */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{product.brand}</p>
                  <h2 className="text-xl font-semibold text-foreground">{product.title}</h2>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-foreground">
                    {formatPrice(product.price)}
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${availabilityInfo.color}`}>
                    {availabilityInfo.text}
                  </span>
                </div>

                {/* Categories */}
                {product.categories && product.categories !== 'N/A' && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Categories</p>
                    <p className="text-sm text-foreground">{product.categories}</p>
                  </div>
                )}

                {/* Match Score */}
                <div className="flex items-center gap-2 p-3 bg-brand/10 rounded-lg">
                  <svg className="w-5 h-5 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-brand-300">
                    {Math.round(product.similarity_score * 100)}% match with your search
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setStep('shipping')}
                    className="flex-1 py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg
                               transition-all duration-300 btn-press brand-glow"
                  >
                    Buy Now
                  </button>
                  {product.url && (
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 bg-accent hover:bg-accent/80 text-foreground font-medium rounded-lg
                                 transition-colors flex items-center gap-2"
                    >
                      <span>View on Amazon</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'shipping' && (
            <div className="p-6">
              <button
                onClick={() => setStep('details')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to product
              </button>

              <h2 className="text-xl font-semibold text-foreground mb-6">Shipping Information</h2>

              <form onSubmit={handleShippingSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={shippingInfo.fullName}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, fullName: e.target.value })}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-foreground
                               placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30
                               focus:border-brand/50 transition-colors text-sm"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Address</label>
                  <input
                    type="text"
                    required
                    value={shippingInfo.address}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-foreground
                               placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30
                               focus:border-brand/50 transition-colors text-sm"
                    placeholder="123 Main Street, Apt 4"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">City</label>
                    <input
                      type="text"
                      required
                      value={shippingInfo.city}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, city: e.target.value })}
                      className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-foreground
                                 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30
                                 focus:border-brand/50 transition-colors text-sm"
                      placeholder="New York"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Postal Code</label>
                    <input
                      type="text"
                      required
                      value={shippingInfo.postalCode}
                      onChange={(e) => setShippingInfo({ ...shippingInfo, postalCode: e.target.value })}
                      className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-foreground
                                 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30
                                 focus:border-brand/50 transition-colors text-sm"
                      placeholder="10001"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Country</label>
                  <input
                    type="text"
                    required
                    value={shippingInfo.country}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, country: e.target.value })}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-foreground
                               placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30
                               focus:border-brand/50 transition-colors text-sm"
                    placeholder="United States"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={shippingInfo.phone}
                    onChange={(e) => setShippingInfo({ ...shippingInfo, phone: e.target.value })}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-foreground
                               placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/30
                               focus:border-brand/50 transition-colors text-sm"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg
                             transition-all duration-300 btn-press brand-glow mt-6"
                >
                  Continue to Payment
                </button>
              </form>
            </div>
          )}

          {step === 'payment' && (
            <div className="p-6">
              <button
                onClick={() => setStep('shipping')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to shipping
              </button>

              <h2 className="text-xl font-semibold text-foreground mb-6">Payment</h2>

              {/* Order Summary */}
              <div className="p-4 bg-muted/50 rounded-lg mb-6">
                <h3 className="text-sm font-medium text-foreground mb-3">Order Summary</h3>
                <div className="flex gap-3 mb-3">
                  <ProductThumbnail url={product.imgUrl} alt={product.title} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2">{product.title}</p>
                    <p className="text-xs text-muted-foreground">{product.brand}</p>
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {formatPrice(product.price)}
                  </div>
                </div>
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">{formatPrice(product.price)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="text-green-500">Free</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground">{formatPrice(product.price)}</span>
                  </div>
                </div>
              </div>

              {/* Shipping Address Summary */}
              <div className="p-4 bg-muted/50 rounded-lg mb-6">
                <h3 className="text-sm font-medium text-foreground mb-2">Shipping to</h3>
                <p className="text-sm text-muted-foreground">
                  {shippingInfo.fullName}<br />
                  {shippingInfo.address}<br />
                  {shippingInfo.city}, {shippingInfo.postalCode}<br />
                  {shippingInfo.country}
                </p>
              </div>

              {/* Payment Method (Mock) */}
              <div className="p-4 bg-muted/50 rounded-lg mb-6">
                <h3 className="text-sm font-medium text-foreground mb-3">Payment Method</h3>
                <div className="flex items-center gap-3 p-3 bg-background rounded-lg border border-brand/30">
                  <div className="w-10 h-6 bg-gradient-to-r from-blue-600 to-blue-400 rounded flex items-center justify-center">
                    <span className="text-white text-[8px] font-bold">VISA</span>
                  </div>
                  <span className="text-sm text-foreground">**** **** **** 4242</span>
                  <span className="text-xs text-muted-foreground ml-auto">Demo Card</span>
                </div>
              </div>

              <button
                onClick={handlePayment}
                disabled={isProcessing}
                className="w-full py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg
                           transition-all duration-300 btn-press brand-glow disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  `Pay ${formatPrice(product.price)}`
                )}
              </button>
            </div>
          )}

          {step === 'confirmation' && (
            <div className="p-6 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center animate-scale-in">
                <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-2xl font-semibold text-foreground mb-2">Order Confirmed!</h2>
              <p className="text-muted-foreground mb-6">
                Thank you for your purchase. Your order has been placed successfully.
              </p>

              <div className="p-4 bg-muted/50 rounded-lg mb-6 text-left">
                <div className="flex gap-3 mb-4">
                  <ProductThumbnail url={product.imgUrl} alt={product.title} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground line-clamp-2">{product.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">Estimated delivery: 5-7 business days</p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Shipping to:</p>
                  {shippingInfo.fullName}, {shippingInfo.address}, {shippingInfo.city}
                </div>
              </div>

              <button
                onClick={handleClose}
                className="w-full py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg
                           transition-all duration-300 btn-press brand-glow"
              >
                Continue Shopping
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
