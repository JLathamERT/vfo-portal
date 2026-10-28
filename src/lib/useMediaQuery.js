import { useEffect, useState } from 'react'

// True while the CSS media query matches; follows the window as it resizes.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// The one phone breakpoint, for a layout that must change SHAPE on a phone (a
// table that becomes cards, a pair of columns that stacks). Prefer layouts that
// reflow on their own (flexWrap, auto-fit grids, minWidth: 0) and reach for this
// only where they cannot.
export const PHONE_QUERY = '(max-width: 640px)'

export function useIsPhone() {
  return useMediaQuery(PHONE_QUERY)
}
