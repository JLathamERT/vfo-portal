// Growth Credits packages - display only. The server's GC_PACKAGES
// (utils/gc-promotions.ts) decides what is charged; keep the two in step.
export const GC_NET_PRICES = { 1: 100, 10: 950, 20: 1800, 50: 4000 }

export const GC_PACKAGES = [1, 10, 20, 50].map(amount => {
  const headline = amount * 100
  const price = GC_NET_PRICES[amount]
  const savings = headline - price
  return { amount, headline, price, savings, discountPct: Math.round(savings / headline * 100) }
})

// Card grosses up so Stripe's 2.9% + $0.30 nets to the package price.
export function gcCardTotal(price) {
  return Math.round((price + 0.30) / (1 - 0.029) * 100) / 100
}

export const gcMoney = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const gcMoney2 = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const creditWord = (n) => (n === 1 ? 'Credit' : 'Credits')
