import { describe, expect, it } from "vitest";
import { assertMutationOrigin, isAllowedSession } from "../../src/lib/auth";
import { centsFromDollars, formatCurrency, parsePassengers, parseRouteStops } from "../../src/lib/utils";
import {
  formatDecimalFlightHours,
  formatFlightHoursDuration,
  formatKilometersFromNauticalMiles,
  formatNauticalMiles,
} from "../../src/lib/measurements";
import {
  aircraftRoute,
  documentRoute,
  documentSourceName,
  documentStorageKey,
  normalizeSourceAgency,
  passengerRoute,
  pendingDocumentRoute,
  pendingDocumentStorageKey,
  publicSlug,
  tripRoute,
} from "../../src/lib/public-routes";
import {
  r2ContentRange,
  r2ResponseLength,
} from "../../src/lib/security";

describe("normalizers and guards", () => {
  it("parses passenger chips and route stops without rewriting text", () => {
    expect(parsePassengers("Jane Doe; John Doe")).toEqual(["Jane Doe", "John Doe"]);
    expect(parseRouteStops("CRW → IAD → CRW")).toEqual(["CRW", "IAD", "CRW"]);
    expect(parseRouteStops("CRW-Local-CRW")).toEqual(["CRW", "Local", "CRW"]);
    expect(parseRouteStops("Bristol, TN - Local-CRW")).toEqual(["Bristol, TN", "Local", "CRW"]);
  });
  it("builds readable, canonical public record routes", () => {
    expect(aircraftRoute("n1wv")).toBe("/aircraft/N1WV");
    expect(passengerRoute("Governor Jim Justice")).toBe("/passengers/governor-jim-justice");
    expect(passengerRoute("Jane Foo-Bar")).toBe("/passengers/jane-foobar");
    expect(passengerRoute("+ 2 USSS Agents")).toBe("/passengers/-2-usss-agents");
    expect(tripRoute({ id: "trip_123", tailNo: "n1wv", reportDate: "2025-12-18" }))
      .toBe("/trips/N1WV/2025-12-18");
    expect(tripRoute({ id: "trip_123", tailNo: null, reportDate: "2025-12-18" }))
      .toBe("/trips/trip_123");
    expect(publicSlug("D'Arcy & Smith")).toBe("darcy-smith");
    expect(documentRoute({
      sourceAgency: "West Virginia Governor's Office",
      originalFilename: "FOIA Response- Siford- 1-10-25.pdf",
    })).toBe(
      "/datasources/wv-governors-office/FOIA%20Response-%20Siford-%201-10-25.pdf",
    );
    expect(documentStorageKey({
      sourceAgency: "WV Aviation Division",
      originalFilename: "Flight Log_N1WV 010117-011425.pdf",
    })).toBe(
      "datasources/wv-aviation-division/Flight Log_N1WV 010117-011425.pdf",
    );
    expect(pendingDocumentStorageKey("a".repeat(64), "new report.pdf")).toBe(
      `datasources/pending/${"a".repeat(64)}/new report.pdf`,
    );
    expect(pendingDocumentRoute("a".repeat(64), "new report.pdf")).toBe(
      `/datasources/pending/${"a".repeat(64)}/new%20report.pdf`,
    );
    expect(normalizeSourceAgency("West Virginia Aviation Division")).toBe(
      "WV Aviation Division",
    );
    expect(documentSourceName(null)).toBe("WV Public Records");
  });
  it("stores exact dollar values in integer cents", () => {
    expect(centsFromDollars(3220.1)).toBe(322010);
  });
  it("omits zero cents from currency displays while retaining nonzero cents", () => {
    expect(formatCurrency(322000)).toBe("$3,220");
    expect(formatCurrency(10025)).toBe("$100.25");
    expect(formatCurrency(57880, { minimumFractionDigits: 2 })).toBe("$578.80");
  });
  it("formats flight hours and distance in both toggleable units", () => {
    expect(formatDecimalFlightHours(1234.56)).toBe("1,234.56 flight hours");
    expect(
      formatDecimalFlightHours(2, { includeUnit: false, compact: true }),
    ).toBe("2.0");
    expect(
      formatDecimalFlightHours(1.25, { includeUnit: false, compact: true }),
    ).toBe("1.3");
    expect(
      formatDecimalFlightHours(6621.9, {
        includeUnit: false,
        compact: true,
      }),
    ).toBe("6,621.9");
    expect(formatFlightHoursDuration(1234.56)).toBe("51d 10h 34m flight time");
    expect(formatFlightHoursDuration(1.1)).toBe("0d 1h 6m flight time");
    expect(formatFlightHoursDuration(2, { compact: true })).toBe("2h");
    expect(formatFlightHoursDuration(26.5, { compact: true })).toBe("1d 2h 30m");
    expect(formatFlightHoursDuration(0, { compact: true })).toBe("0m");
    expect(formatNauticalMiles(1000)).toBe("1,000.00 nautical miles");
    expect(formatKilometersFromNauticalMiles(1000)).toBe("1,852.0 kilometers");
    expect(formatNauticalMiles(1000, { compact: true })).toBe("1,000.00 nmi");
    expect(formatKilometersFromNauticalMiles(1000, { compact: true })).toBe("1,852.0 km");
  });
  it("formats R2 byte ranges without treating full responses as partial", () => {
    expect(r2ResponseLength({ size: 100 })).toBe(100);
    expect(r2ContentRange({ size: 100 })).toBeNull();
    expect(r2ResponseLength({ size: 100, range: { offset: 10, length: 20 } })).toBe(20);
    expect(r2ContentRange({ size: 100, range: { offset: 10, length: 20 } }))
      .toBe("bytes 10-29/100");
    expect(r2ContentRange({ size: 100, range: { suffix: 5 } }))
      .toBe("bytes 95-99/100");
  });
  it("requires a verified, case-insensitive allowlisted admin", () => {
    const env = { ADMIN_EMAILS: "admin@example.com" };
    const session = (email: string, emailVerified: boolean) =>
      ({
        user: { email, emailVerified },
        session: {},
      }) as Parameters<typeof isAllowedSession>[0];
    expect(isAllowedSession(session("Admin@EXAMPLE.COM", true), env)).toBe(true);
    expect(isAllowedSession(session("admin@example.com", false), env)).toBe(false);
    expect(isAllowedSession(session("someone@example.com", true), env)).toBe(false);
  });
  it("rejects cross-origin and origin-less mutations", () => {
    const env = { PUBLIC_ORIGIN: "https://l.abs.codes" };
    expect(() =>
      assertMutationOrigin(
        new Request("https://l.abs.codes/wv-gov-flights/api", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
        env,
      ),
    ).toThrow();
    expect(() =>
      assertMutationOrigin(
        new Request("https://l.abs.codes/wv-gov-flights/api", {
          method: "POST",
        }),
        env,
      ),
    ).toThrow();
  });
});
