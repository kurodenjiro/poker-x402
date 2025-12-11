/**
 * Format number with consistent locale to avoid hydration mismatches
 * Always uses 'en-US' locale for consistent formatting across server and client
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Format currency with consistent locale
 */
export function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

