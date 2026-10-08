export const tripMultiFilterKeys = ["aircraft", "department", "division"] as const;
export const tripFilterKeys = [
  "search",
  "aircraft",
  "department",
  "division",
  "startDate",
  "endDate",
] as const;
export const tripSortValues = [
  "date",
  "distance",
  "time",
  "amount",
  "passengers",
] as const;

export type TripFilterKey = (typeof tripFilterKeys)[number];
export type TripSort = (typeof tripSortValues)[number];

const multiFilterKeys = new Set<string>(tripMultiFilterKeys);

export function tripSort(value: string | null | undefined): TripSort {
  return tripSortValues.includes(value as TripSort) ? value as TripSort : "date";
}

export function canonicalTripTableParams(
  url: URL,
  allowedFilterKeys: readonly TripFilterKey[] = tripFilterKeys,
) {
  const params = new URLSearchParams();

  for (const key of allowedFilterKeys) {
    const values = multiFilterKeys.has(key)
      ? [...new Set(url.searchParams.getAll(key).map((value) => value.trim()).filter(Boolean))]
      : [
          key === "search"
            ? (url.searchParams.get("search")?.trim() || url.searchParams.get("q")?.trim() || "")
            : (url.searchParams.get(key)?.trim() ?? ""),
        ];

    for (const value of values) {
      if (value) params.append(key, value);
    }
  }

  const page = url.searchParams.get("page")?.trim() ?? "";
  if (/^[1-9]\d*$/.test(page) && Number.isSafeInteger(Number(page)) && page !== "1") {
    params.set("page", page);
  }

  const limit = url.searchParams.get("limit")?.trim();
  if (limit) params.set("limit", limit);

  const requestedSort = url.searchParams.get("sort")?.trim();
  if (
    requestedSort
    && requestedSort !== "date"
    && tripSortValues.includes(requestedSort as TripSort)
  ) {
    params.set("sort", requestedSort);
  }

  return params;
}

export function tripTableHref(
  path: string,
  url: URL,
  updates: Record<string, string | null> = {},
  allowedFilterKeys: readonly TripFilterKey[] = tripFilterKeys,
) {
  const params = canonicalTripTableParams(url, allowedFilterKeys);
  for (const [key, value] of Object.entries(updates)) {
    if (value && !(key === "page" && value === "1")) params.set(key, value);
    else params.delete(key);
  }
  return params.size > 0 ? `${path}?${params}` : path;
}

export function hasActiveTripFilters(
  url: URL,
  allowedFilterKeys: readonly TripFilterKey[] = tripFilterKeys,
) {
  const params = canonicalTripTableParams(url, allowedFilterKeys);
  return allowedFilterKeys.some((key) => params.has(key));
}

export function paginationItems(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages]);
  for (
    let page = Math.max(1, currentPage - 2);
    page <= Math.min(totalPages, currentPage + 2);
    page += 1
  ) {
    pages.add(page);
  }
  const orderedPages = [...pages].sort((a, b) => a - b);
  return orderedPages.flatMap((page, index) => {
    const previous = orderedPages[index - 1];
    return previous && page - previous > 1 ? (["ellipsis", page] as const) : [page];
  });
}
