// The greeting on a portal's landing page (Jake, 2026-11-26): by the time of day
// on the person's own device, so it follows their time zone wherever they sign in.
// 5am-noon morning, noon-5pm afternoon, otherwise evening.
export function timeGreeting(date = new Date()) {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}
