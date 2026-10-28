/* eslint-disable @next/next/no-img-element */
// printLogo: the full OneSpeed logo at the top of printouts (off for staff lists like Items to push)
export function TopBar({ subtitle, who, printLogo = true }: { subtitle?: string; who: string; printLogo?: boolean }) {
  return (
    <>
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <img src="/brand/mark-cream.png" alt="" width={36} height={40} style={{ height: 40, width: 'auto' }} />
          <span className="brand">OneSpeed</span>
          {subtitle && <span className="small">{subtitle}</span>}
        </div>
        <div className="who">
          <span>{who}</span>
          <form action="/auth/signout" method="post">
            <button className="link" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      {printLogo && <div className="print-logo"><img src="/brand/logo.png" alt="OneSpeed Management" /></div>}
    </>
  );
}
