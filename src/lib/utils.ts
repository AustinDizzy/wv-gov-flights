import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  cents: number | null | undefined,
  options: { minimumFractionDigits?: number } = {},
): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/^[,;|\s]+|[,;|\s]+$/g, "")
    .trim();
}

export function parsePassengers(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/\s*(?:,|;|\||\n)\s*/)
    .map(normalizePersonName)
    .filter(Boolean);
}

export function parseRouteStops(value: string): string[] {
  return value
    .split(/\s*(?:→|->|–|—|\bTO\b|\bVIA\b|\/|-)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function centsFromDollars(value: number | null): number | null {
  return value == null ? null : Math.round((value + Number.EPSILON) * 100);
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function stableId(prefix: string, value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = [...new Uint8Array(hash)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${hex}`;
}
