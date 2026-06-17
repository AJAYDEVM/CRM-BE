const ones = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${tens[t]}${o ? ` ${ones[o]}` : ''}`.trim();
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const hundred = h ? `${ones[h]} Hundred` : '';
  const tail = rest ? twoDigits(rest) : '';
  return [hundred, tail].filter(Boolean).join(' ');
}

function integerToWords(n: number): string {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function amountToIndianWords(amount: number | string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'Indian Rupee Zero Only';

  const rupees = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - rupees) * 100);

  let words = `Indian Rupee ${integerToWords(rupees)}`;
  if (paise > 0) {
    words += ` and ${integerToWords(paise)} Paise`;
  }
  words += ' Only';

  return words;
}
