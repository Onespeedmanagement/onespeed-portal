const LINKS = [
  ['/portfolio', 'Portfolio'],
  ['/dashboard', 'Dashboard'],
  ['/owners', 'Owners Report'],
  ['/forecasting', 'Forecasting'],
  ['/cash', 'Cash & deposits'],
  ['/discrepancies', 'Discrepancies'],
  ['/admin/upload', 'Upload POS reports'],
  ['/admin/users', 'Users & employees'],
  ['/admin/stores', 'Stores'],
  ['/contracts', 'Contracts'],
] as const;

export function AdminNav({ active }: { active: string }) {
  return (
    <nav aria-label="Admin" style={{ background: '#2c5240', padding: '0 clamp(16px, 3vw, 40px)', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
      {LINKS.map(([href, label]) => (
        <a key={href} href={href} style={{
          color: href === active ? '#fff' : '#e9e3d2', textDecoration: 'none', fontSize: 14, padding: '12px 2px',
          borderBottom: `3px solid ${href === active ? 'var(--gold)' : 'transparent'}`,
        }}>{label}</a>
      ))}
    </nav>
  );
}
