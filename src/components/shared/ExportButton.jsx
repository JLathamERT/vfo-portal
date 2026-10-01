import { downloadXlsx, exportFilename } from '../../lib/exportXlsx'

// Exports exactly the rows the caller is rendering (search + filters + sort
// already applied) as an Excel workbook named after the list.
export default function ExportButton({ title, columns, rows }) {
  const count = rows?.length || 0
  return (
    <button type="button" disabled={count === 0}
      onClick={() => downloadXlsx(exportFilename(title), title, columns, rows)}
      title={count ? `Download these ${count} as an Excel file` : 'Nothing to export'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: count ? 'var(--vfo-ink)' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, fontFamily: 'Inter, sans-serif', cursor: count ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
      Export
    </button>
  )
}
