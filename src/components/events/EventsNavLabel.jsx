// The member portal's Events tab (2026-11-25): its name shimmers in the Elite VFO
// Collective's blue and orange, with a soft glow and two small sparkles, so it draws
// the eye beside the plain tabs. Still for anyone who asked for less motion.

const CSS = `
@keyframes vfoEvTabText { 0% { background-position: 0% 0 } 100% { background-position: -300% 0 } }
@keyframes vfoEvTabGlow { 0%, 100% { filter: drop-shadow(0 0 0 rgba(255,138,90,0)) } 50% { filter: drop-shadow(0 0 7px rgba(255,138,90,0.6)) } }
@keyframes vfoEvTwinkle { 0%, 100% { opacity: 0; transform: scale(0.3) rotate(0deg) } 45% { opacity: 1; transform: scale(1) rotate(40deg) } }
.vfo-ev-tab { position: relative; display: inline-flex; align-items: center; font-weight: 800; animation: vfoEvTabGlow 2.6s ease-in-out infinite }
.vfo-ev-tab-text { background-image: linear-gradient(100deg, #125ecc 0%, #0a94f5 18%, #f26a2e 34%, #ff9f73 45%, #f26a2e 56%, #0a94f5 78%, #125ecc 100%); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: vfoEvTabText 4.5s linear infinite }
:root[data-theme="dark"] .vfo-ev-tab-text { background-image: linear-gradient(100deg, #8cc8ff 0%, #4db5ff 18%, #ff9d73 36%, #ffffff 45%, #ff9d73 54%, #4db5ff 78%, #8cc8ff 100%) }
.vfo-ev-spark { position: absolute; width: 9px; height: 9px; color: #ff8a5a; opacity: 0; animation: vfoEvTwinkle 2.6s ease-in-out infinite; pointer-events: none }
@media (prefers-reduced-motion: reduce) { .vfo-ev-tab, .vfo-ev-tab-text, .vfo-ev-spark { animation: none !important } }
`
const Spark = ({ style }) => (
  <svg className="vfo-ev-spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}><path d="M12 0c1.2 7 4.800 10.800 12 12-7.200 1.200-10.800 5-12 12-1.200-7-4.800-10.800-12-12C7.200 10.800 10.800 7 12 0z" /></svg>
)

export default function EventsNavLabel() {
  return (
    <span className="vfo-ev-tab">
      <style>{CSS}</style>
      <span className="vfo-ev-tab-text">Events</span>
      <Spark style={{ top: '-5px', right: '-11px' }} />
      <Spark style={{ bottom: '-5px', left: '-9px', width: '7px', height: '7px', color: '#0a94f5', animationDelay: '1.3s' }} />
    </span>
  )
}
