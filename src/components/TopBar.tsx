export function TopBar({ subtitle, who }: { subtitle?: string; who: string }) {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <span className="brand">One Speed</span>
        {subtitle && <span className="small">{subtitle}</span>}
      </div>
      <div className="who">
        <span>{who}</span>
        <form action="/auth/signout" method="post">
          <button className="link" type="submit">Sign out</button>
        </form>
      </div>
    </header>
  );
}
