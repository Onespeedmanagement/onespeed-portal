// One look for every menu bar: rounded "bubbles", the current page in gold, groups split by a thin line
export type NavLink = readonly [href: string, label: string];

export function NavBar({ label, groups, active, className }: { label: string; groups: (readonly NavLink[])[]; active: string; className?: string }) {
  return (
    <nav aria-label={label} className={`navbar${className ? ` ${className}` : ''}`}>
      {groups.filter((g) => g.length).map((g, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="navsep" aria-hidden="true" />}
          <span className="navgroup">
            {g.map(([href, text]) => (
              <a key={href} href={href} aria-current={href === active ? 'page' : undefined}
                className={`navpill${href === active ? ' active' : ''}${text.startsWith('←') ? ' back' : ''}`}>{text}</a>
            ))}
          </span>
        </span>
      ))}
    </nav>
  );
}
