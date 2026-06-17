export function formatIndianDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

export function formatIndianNumber(amount: number | string): string {
  const value = Number(amount);
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatIndianCurrency(amount: number | string): string {
  return `Rs.${formatIndianNumber(amount)}`;
}
