export function BookkeeperNav({ active }: { active: string }) {
  const links = [['/bookkeeper', 'Daily entries'], ['/bookkeeper/owners', 'Owners Report'], ['/bookkeeper/upload', 'Upload POS reports'], ['/goddard', 'Goddard']] as const;
  return (
    <nav aria-label="Bookkeeping" style={{ background: '#2c5240', padding: '0 clamp(16px, 3vw, 40px)', display: 'flex', gap: 22 }}>
      {links.map(([href, label]) => (
        <a key={href} href={href} style={{ color: href === active ? '#fff' : '#e9e3d2', textDecoration: 'none', fontSize: 14, padding: '12px 2px',
          borderBottom: `3px solid ${href === active ? 'var(--gold)' : 'transparent'}` }}>{label}</a>
      ))}
    </nav>
  );
}
