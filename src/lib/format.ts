const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const money = (n: number | null | undefined) => (n == null ? '—' : usd.format(n));

export const signedMoney = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + usd.format(Math.abs(n));

export function longDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

export const toCents = (s: string | number | null | undefined) => {
  if (s == null || s === '') return 0;
  const n = typeof s === 'number' ? s : Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
