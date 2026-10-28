// DEV ONLY - the phone rules (docs/architecture/02-frontend-shell.md, "Phone
// rules") as checks, run on a page drawn at phone width. Used by the phone
// preview's Audit button and by Claude in the browser pane:
//   const { phoneAudit } = await import('/src/dev/phoneAudit.js'); phoneAudit(window)
// A finding is a prompt to look, not a verdict - a big button can be right, but
// then it is a choice. Each one is outlined red on the page until clearAudit().

const MARK = 'data-phone-audit'

export function clearAudit(win = window) {
  win.document.querySelectorAll(`[${MARK}]`).forEach(el => { el.style.outline = el.getAttribute(MARK); el.removeAttribute(MARK) })
}

export function phoneAudit(win = window, { outline = true } = {}) {
  const doc = win.document
  const css = el => win.getComputedStyle(el)
  const W = doc.documentElement.clientWidth
  const findings = []
  const flagged = new Set()
  clearAudit(win)

  const shown = el => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return false
    for (let p = el; p && p !== doc.body; p = p.parentElement) {
      const s = css(p)
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false
    }
    return true
  }
  const inFixed = el => { for (let p = el; p && p !== doc.body; p = p.parentElement) if (css(p).position === 'fixed') return true; return false }
  const inScroller = el => { for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) { const o = css(p).overflowX; if (o === 'auto' || o === 'scroll') return true } return false }
  const underFlagged = el => { for (let p = el.parentElement; p; p = p.parentElement) if (flagged.has(p)) return true; return false }
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('alt') || el.tagName.toLowerCase()).trim().replace(/\s+/g, ' ').slice(0, 60)
  const add = (rule, el, detail) => {
    flagged.add(el)
    findings.push({ rule, detail, what: label(el) })
    if (outline && !el.hasAttribute(MARK)) { el.setAttribute(MARK, el.style.outline || ''); el.style.outline = '2px solid #e74c3c' }
  }
  const all = [...doc.body.querySelectorAll('*')].filter(el => !inFixed(el) && shown(el))
  const isCard = s => (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.borderTopWidth !== '0px') && parseFloat(s.borderTopLeftRadius) >= 8

  for (const el of all) {
    const r = el.getBoundingClientRect()
    const s = css(el)

    // 1. Nothing past the edge (body clips it silently).
    if ((r.right > W + 1 || r.left < -1) && !inScroller(el) && !underFlagged(el)) {
      add('Off the edge', el, `${Math.round(r.left)}-${Math.round(r.right)}px on a ${W}px screen`)
      continue
    }
    // 2. Never cut off what people read.
    if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      add('Cut-off text', el, 'ends in "..." - wrap it or clamp to 2 lines')
    }
    // 3. Smaller buttons.
    // A plain text button (no fill, no border) is not visually big, whatever its box.
    const looksLikeButton = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || s.borderTopWidth !== '0px'
    if (el.matches('button, [role=button], input[type=submit]') && looksLikeButton) {
      const fs = parseFloat(s.fontSize)
      if (r.height > 40 || fs > 15) add('Big button', el, `${Math.round(r.height)}px tall, ${fs}px text`)
    }
    // 4. No decoration that does nothing.
    const decorative = el.matches('img, svg') || (el.children.length === 0 && /^\p{Extended_Pictographic}️?$/u.test((el.textContent || '').trim()))
    if (decorative && s.cursor !== 'pointer' && !el.closest('button, a, label, [role=button]') && (r.width > 28 || r.height > 28) && !(el.parentElement && el.parentElement.closest('svg'))) {
      add('Decoration?', el, `${Math.round(r.width)}x${Math.round(r.height)} and not tappable - is it needed on a phone?`)
    }
    // 5. Balanced rows: a wrapped row whose last line is shorter than its first.
    if ((s.display === 'flex' || s.display === 'inline-flex') && s.flexWrap === 'wrap' && s.flexDirection.startsWith('row')) {
      const kids = [...el.children].filter(shown)
      // Only a row of LIKE items (stats, chips, cards) - a name + control row of
      // different-sized parts is meant to stack.
      const widths = kids.map(k => k.getBoundingClientRect().width)
      const alike = kids.length >= 3 && Math.max(...widths) / Math.max(1, Math.min(...widths)) < 2.5
      if (alike) {
        const rows = []
        for (const k of kids) {
          const top = Math.round(k.getBoundingClientRect().top)
          const row = rows.find(x => Math.abs(x.top - top) < 6)
          if (row) row.n++; else rows.push({ top, n: 1 })
        }
        // A last line holding one full-width item is a deliberate line of its own.
        const last = kids[kids.length - 1]
        const ownLine = rows[rows.length - 1].n === 1 && css(last).flexBasis === '100%'
        if (rows.length >= 2 && rows[rows.length - 1].n < rows[0].n && !ownLine) add('Uneven wrap', el, `${rows.map(x => x.n).join(' / ')} per line - list it or size it to fit`)
      }
    }
    // 6. A whole card for one value.
    if (isCard(s) && r.height > 60 && r.width > W * 0.6) {
      const texts = [...el.querySelectorAll('*')].filter(k => k.children.length === 0 && (k.textContent || '').trim())
      const chars = texts.reduce((n, k) => n + k.textContent.trim().length, 0)
      if (texts.length > 0 && texts.length <= 2 && chars < 60 && !el.querySelector('input, select, textarea, button, img')) add('Card for one value', el, 'make it a single row')
    }
    // 7. No double padding: card content far from the screen edge.
    if (isCard(s) && r.width > W * 0.6) {
      const inset = r.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth)
      if (inset > 44 && !underFlagged(el)) add('Double padding', el, `content starts ${Math.round(inset)}px from the edge`)
    }
    // 8. Readable text.
    if (el.children.length === 0 && /[A-Za-z0-9]{2,}/.test(el.textContent || '') && parseFloat(s.fontSize) < 10.5) {
      add('Tiny text', el, `${s.fontSize}`)
    }
  }

  // 9-11. Text that does not fit where it sits. Measured on the text's own line
  // boxes (a Range), so padding and icons do not count as lines.
  const holders = all.filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
  const range = doc.createRange()
  const textOf = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()
  const lineBoxes = el => {
    const boxes = []
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      range.selectNodeContents(n)
      for (const rc of range.getClientRects()) if (rc.width > 0.5) boxes.push(rc)
    }
    return boxes
  }
  const placed = []
  for (const el of holders) {
    if (el.closest('select, option, textarea, input')) continue
    const text = textOf(el)
    const boxes = lineBoxes(el)
    const lines = new Set(boxes.map(b => Math.round(b.top))).size
    const w = el.getBoundingClientRect().width
    // A <wbr> (EmailText breaks before the @) marks a deliberate break point.
    const brokeAtWbr = !!el.querySelector('wbr')
    if (lines >= 2 && !/\s/.test(text) && text.length > 3 && !brokeAtWbr) add('Broken word', el, `"${text.slice(0, 24)}" splits over ${lines} lines - keep it whole (nowrap) or give it its own line`)
    else if (lines >= 2 && text.length <= 14) add('Squeezed text', el, `a ${text.length}-character label wraps onto ${lines} lines`)
    else if (lines >= 3 && w < 120) add('Squeezed text', el, `${lines} lines in a ${Math.round(w)}px column - give it the row's width`)
    if (boxes.length) placed.push({ el, left: Math.min(...boxes.map(b => b.left)), right: Math.max(...boxes.map(b => b.right)), top: Math.min(...boxes.map(b => b.top)), bottom: Math.max(...boxes.map(b => b.bottom)) })
  }
  // Crammed: two separate pieces of text touching or overlapping on one line
  // ("ActiveView"). Words inside one sentence are one text holder, so they never pair.
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j]
      // Same parent = one styled run on purpose (the VFO + SERVICES wordmark).
      if (a.el.contains(b.el) || b.el.contains(a.el) || a.el.parentElement === b.el.parentElement) continue
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (overlapY < Math.min(a.bottom - a.top, b.bottom - b.top) * 0.5) continue
      const gap = a.left < b.left ? b.left - a.right : a.left - b.right
      if (gap < 2.5 && !flagged.has(a.el) && !flagged.has(b.el)) add('Crammed', b.el, `touches "${textOf(a.el).slice(0, 20)}" - give them space or separate lines`)
    }
  }

  const byRule = findings.reduce((m, f) => ({ ...m, [f.rule]: (m[f.rule] || 0) + 1 }), {})
  return { width: W, total: findings.length, byRule, findings }
}
