import { useState } from 'react'
import SubscriptionModal from '../components/SubscriptionModal'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for trying out epipar.io',
    features: [
      '3 room scans per month',
      'Basic 3D reconstruction',
      'Standard resolution',
      'Export to PLY format',
      'Community support',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: 'per month',
    description: 'For professionals and enthusiasts',
    features: [
      'Unlimited room scans',
      'HD 3D reconstruction',
      'Gaussian splatting export',
      'All export formats',
      'Priority processing',
      'Email support',
      'API access',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: 'per month',
    description: 'For teams and businesses',
    features: [
      'Everything in Pro',
      'Ultra HD reconstruction',
      'Custom model training',
      'Team collaboration',
      'Dedicated support',
      'SLA guarantee',
      'On-premise deployment',
      'Custom integrations',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

type Plan = typeof plans[number]

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan)
    setIsModalOpen(true)
  }

  return (
    <>
      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 w-full">
        <div>
          {/* Header */}
          <div className="text-center mb-12 sm:mb-16 select-none">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4 tracking-tight opacity-0 animate-slide-up stagger-1">
              Simple, transparent pricing
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto opacity-0 animate-slide-up stagger-2">
              Choose the plan that fits your needs. Upgrade or downgrade anytime.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 pt-4">
            {plans.map((plan, index) => (
              <div
                key={plan.name}
                className={`relative p-6 sm:p-8 rounded-xl border transition-all duration-300 hover-lift opacity-0 animate-slide-up overflow-visible ${
                  plan.popular
                    ? 'bg-muted border-brand/40 md:scale-[1.02]'
                    : 'bg-muted/50 border-border/50 hover:border-border card-shine'
                }`}
                style={{ animationDelay: `${0.3 + index * 0.1}s` }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-brand text-white text-xs font-medium rounded-full animate-pulse-subtle">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">/{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan)}
                  className={`w-full py-3 rounded-lg font-medium text-sm transition-all duration-300 btn-press ${
                    plan.popular
                      ? 'bg-brand hover:bg-brand-500 text-white brand-glow'
                      : 'bg-accent hover:bg-accent/80 text-foreground border border-border'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="mt-16 sm:mt-20">
            <h2 className="text-2xl font-semibold text-foreground text-center mb-8 opacity-0 animate-slide-up" style={{ animationDelay: '0.6s' }}>
              Frequently asked questions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {[
                {
                  q: 'Can I cancel anytime?',
                  a: 'Yes, you can cancel your subscription at any time. Your access will continue until the end of your billing period.',
                },
                {
                  q: 'What payment methods do you accept?',
                  a: 'We accept all major credit cards, PayPal, and bank transfers for enterprise plans.',
                },
                {
                  q: 'Is there a free trial?',
                  a: 'Yes, Pro plans come with a 14-day free trial. No credit card required to start.',
                },
                {
                  q: 'What happens to my scans if I downgrade?',
                  a: 'Your existing scans remain accessible. You just won\'t be able to create new ones beyond your plan limit.',
                },
              ].map((faq, index) => (
                <div
                  key={faq.q}
                  className="p-5 rounded-xl bg-muted/50 border border-border/50 hover:border-border transition-all duration-300 hover-lift opacity-0 animate-slide-up"
                  style={{ animationDelay: `${0.7 + index * 0.1}s` }}
                >
                  <h3 className="text-sm font-medium text-foreground mb-2">{faq.q}</h3>
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Subscription Modal */}
      <SubscriptionModal
        plan={selectedPlan}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
