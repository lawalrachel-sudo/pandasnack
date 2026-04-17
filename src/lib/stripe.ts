import Stripe from 'stripe'

// Stripe is optional — only initialized when STRIPE_SECRET_KEY is set
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key || key === 'sk_test_xxx') {
    return null
  }
  return new Stripe(key)
}
