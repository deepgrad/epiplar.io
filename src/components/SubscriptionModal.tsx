import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { updatePlan } from '../services/api'

interface Plan {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: string
  popular: boolean
}

interface SubscriptionModalProps {
  plan: Plan | null
  isOpen: boolean
  onClose: () => void
}

export default function SubscriptionModal({ plan, isOpen, onClose }: SubscriptionModalProps) {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [isProcessing, setIsProcessing] = useState(false)
  const [step, setStep] = useState<'details' | 'payment' | 'success'>('details')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !plan) return null

  const handleSubscribe = async () => {
    if (!user) {
      onClose()
      navigate('/login')
      return
    }

    if (plan.name === 'Free') {
      onClose()
      navigate('/')
      return
    }

    if (plan.name === 'Enterprise') {
      // For enterprise, show contact form or redirect
      setStep('success')
      return
    }

    setStep('payment')
  }

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsProcessing(true)
    setError(null)

    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Update the plan in the backend
      const planName = plan.name.toLowerCase()
      await updatePlan(planName)

      // Refresh user data to get updated plan
      if (refreshUser) {
        await refreshUser()
      }

      setStep('success')
    } catch (err) {
      console.error('Failed to update plan:', err)
      setError(err instanceof Error ? err.message : 'Failed to process payment')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    setStep('details')
    setCardNumber('')
    setExpiry('')
    setCvc('')
    setError(null)
    onClose()
  }

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    return parts.length ? parts.join(' ') : value
  }

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4)
    }
    return v
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-muted border border-border rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-accent hover:bg-accent/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {step === 'details' && (
          <div className="p-6 sm:p-8">
            {/* Plan header */}
            <div className="text-center mb-6">
              {plan.popular && (
                <span className="inline-block px-3 py-1 bg-brand/20 text-brand-300 text-xs font-medium rounded-full mb-3">
                  Most Popular
                </span>
              )}
              <h2 className="text-2xl font-bold text-foreground mb-1">{plan.name} Plan</h2>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground">/{plan.period}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
            </div>

            {/* Features */}
            <div className="bg-accent/50 rounded-xl p-4 mb-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">What's included</p>
              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
            <button
              onClick={handleSubscribe}
              className="w-full py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-all duration-300 btn-press brand-glow"
            >
              {!user ? 'Sign in to subscribe' : plan.name === 'Free' ? 'Get Started Free' : plan.name === 'Enterprise' ? 'Contact Sales' : `Subscribe to ${plan.name}`}
            </button>

            {plan.name === 'Pro' && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                14-day free trial. Cancel anytime.
              </p>
            )}
          </div>
        )}

        {step === 'payment' && (
          <form onSubmit={handlePayment} className="p-6 sm:p-8">
            <h2 className="text-xl font-bold text-foreground mb-1">Payment Details</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Subscribe to {plan.name} for {plan.price}/{plan.period}
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Card Number</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  required
                  className="w-full px-3 py-2.5 bg-accent border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-colors text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Expiry</label>
                  <input
                    type="text"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                    maxLength={5}
                    required
                    className="w-full px-3 py-2.5 bg-accent border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">CVC</label>
                  <input
                    type="text"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="123"
                    maxLength={4}
                    required
                    className="w-full px-3 py-2.5 bg-accent border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-colors text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="bg-accent/50 rounded-lg p-4 mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">{plan.name} Plan</span>
                <span className="text-foreground">{plan.price}/{plan.period}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t border-border pt-2">
                <span className="text-foreground">Total today</span>
                <span className="text-foreground">{plan.price}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-all duration-300 btn-press brand-glow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                `Pay ${plan.price}`
              )}
            </button>

            <button
              type="button"
              onClick={() => setStep('details')}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-3"
            >
              Back to plan details
            </button>

            <p className="text-xs text-muted-foreground text-center mt-4">
              <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Payments are secure and encrypted
            </p>
          </form>
        )}

        {step === 'success' && (
          <div className="p-6 sm:p-8 text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-2">
              {plan.name === 'Enterprise' ? 'Request Sent!' : 'Welcome to ' + plan.name + '!'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {plan.name === 'Enterprise'
                ? "Our sales team will contact you within 24 hours to discuss your needs."
                : "Your subscription is now active. You can start using all the " + plan.name + " features right away."}
            </p>

            <button
              onClick={() => {
                handleClose()
                navigate('/')
              }}
              className="w-full py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-all duration-300 btn-press"
            >
              {plan.name === 'Enterprise' ? 'Back to Home' : 'Start Creating'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
