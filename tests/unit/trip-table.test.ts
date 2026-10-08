import { describe, expect, it } from "vitest";
import {
  canonicalTripTableParams,
  tripFilterKeys,
  tripTableHref,
} from "../../src/lib/trip-table";

describe("trip table URLs", () => {
  it("uses search as the canonical key while accepting old q links", () => {
    const url = new URL(
      "https://example.test/trips?q=state+police&aircraft=N1WV&aircraft=N1WV&page=1&extra=nope",
    );

    expect(canonicalTripTableParams(url).toString()).toBe(
      "search=state+police&aircraft=N1WV",
    );
    expect(tripTableHref("/trips", url)).toBe(
      "/trips?search=state+police&aircraft=N1WV",
    );
  });

  it("omits filters that are fixed by a profile page", () => {
    const url = new URL(
      "https://example.test/aircraft/N1WV?search=foobar&aircraft=N2WV&department=Aviation&page=3",
    );
    const aircraftProfileKeys = tripFilterKeys.filter((key) => key !== "aircraft");

    expect(
      tripTableHref(
        "/aircraft/N1WV",
        url,
        { page: "2" },
        aircraftProfileKeys,
      ),
    ).toBe(
      "/aircraft/N1WV?search=foobar&department=Aviation&page=2",
    );
  });

  it("keeps valid dataset sorts while removing unknown sort values", () => {
    expect(
      canonicalTripTableParams(
        new URL("https://example.test/trips?department=Aviation&sort=distance"),
      ).toString(),
    ).toBe("department=Aviation&sort=distance");
    expect(
      canonicalTripTableParams(
        new URL("https://example.test/trips?sort=ascending"),
      ).toString(),
    ).toBe("");
    expect(
      canonicalTripTableParams(
        new URL("https://example.test/trips?sort=date"),
      ).toString(),
    ).toBe("");
  });

  it("preserves the camel-case date range parameters", () => {
    const url = new URL(
      "https://example.test/trips?startDate=2026-01-20&endDate=2026-02-09&date_from=legacy",
    );

    expect(canonicalTripTableParams(url).toString()).toBe(
      "startDate=2026-01-20&endDate=2026-02-09",
    );
  });
});
