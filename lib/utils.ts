import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with K/M suffixes for display
 */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * Validate that a cron request is authenticated
 */
export function validateCronAuth(authHeader: string | null): boolean {
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * Get a date range string for display
 */
export function formatDateRange(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const e = new Date(end).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${s} – ${e}`;
}
