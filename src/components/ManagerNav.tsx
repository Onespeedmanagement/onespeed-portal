// Store tools bar: managers see it at the top of their pages; admins see it on the store tool pages
export function ManagerNav({ active, admin = false }: { active: string; admin?: boolean }) {
  const links = [...(admin ? [['/portfolio', '← Portfolio']] : [['/closeout', 'Close-out']]), ['/push', 'Items to push'], ['/schedule', 'Schedule Assistant']];
  return (
    <nav aria-label="Store tools" className="no-print" style={{ background: '#2c5240', padding: '0 clamp(16px, 3vw, 40px)', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
      {links.map(([href, label]) => (
        <a key={href} href={href} style={{ color: href === active ? '#fff' : '#e9e3d2', textDecoration: 'none', fontSize: 14, padding: '12px 2px',
          borderBottom: `3px solid ${href === active ? 'var(--gold)' : 'transparent'}` }}>{label}</a>
      ))}
    </nav>
  );
}
