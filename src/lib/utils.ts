import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as turf from "@turf/turf"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isValidDate(dateString: string) {
  return [
    /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateString),
    Number(dateString.split('-')[0]) >= 2010,
    Number(dateString.split('-')[1]) <= 12,
    Number(dateString.split('-')[2]) <= 31,
    Number(dateString.split('-')[2]) >= 1
  ].every(Boolean)
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const hr = Math.floor(totalMinutes / 60)
  const min = totalMinutes % 60
  return `${min > 0 ? '~' : ''}${hr > 0 ? hr + 'h' : ''}${min > 0 ? (hr > 0 ? min.toString().padStart(2, '0') : min) + 'm' : ''}`
}


// Takes a name and returns a slugified version of it (ex. 'Hello World' -> 'hello-world')
export function parseNameSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Takes a slug and returns a formatted version of it (ex. 'hello-world' -> 'Hello World')
export function formatNameSlug(name: string): string {
  return name
    .trim()
    .replace(/-+/g, ' ')
    .trim()
    .replace(/\b\w/g, l => l.toUpperCase());
}

export function parseWKT(wkt: string): [number, number][] {
  if (!wkt.startsWith("LINESTRING")) throw new Error("Unsupported WKT type.");
  return wkt
    .trim()
    .replace("LINESTRING", "")
    .trim()
    .replace(/\(|\)/g, "")
    .split(",")
    .map(coord => coord.trim().split(" ").map(Number).reverse() as [number, number]);
};

export function calcDistance(lines: string[], units: "nauticalmiles" | "kilometers" = "nauticalmiles"): number {
  return lines
    .map(parseWKT)
    .filter(wkt => wkt.length > 1)
    .filter(wkt => wkt.length > 1)
    .map(wkt => turf.lineString(wkt))
    .map(line => turf.length(line, { units: units }))
    .reduce((a, b) => a + b, 0);
}

export function getPax(passengers?: string): string[] {
  if (!passengers) return [];
  return passengers.split(',')
  .map(p => p.trim())
  .map(p => p.split(/;(?=(?:[^()]*\([^()]*\))*[^()]*$)/))
  .flat()
  .map(p => p.trim());
}

export function getPaxMap(passengers?: string): Record<string, string> {
  if (!passengers) return {};
  return Object.fromEntries(getPax(passengers).map(p => [parseNameSlug(p), p]));
}

export function hasPax(passengers: string | undefined, slug: string): boolean {
  if (!passengers) return false;
  return getPaxMap(passengers).hasOwnProperty(slug.trim());
}