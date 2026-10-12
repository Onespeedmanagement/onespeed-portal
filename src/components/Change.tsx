export function Change({ c }: { c: { text: string; dir: string } }) {
  const color = c.dir === 'up' ? '#2f6b3f' : c.dir === 'down' ? '#a8431b' : 'var(--muted)';
  return <span style={{ color, whiteSpace: 'nowrap' }}>{c.text}</span>;
}
