import { z } from "zod";
import {
  absoluteTracePoints,
  splitTrace,
  type FlightSegment,
  type GlobeTraceResponse,
} from "./trace";

const MAX_RAW_RESPONSE_BYTES = 32 * 1024 * 1024;

const tracePointSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.union([z.number(), z.literal("ground"), z.null()]),
]).rest(z.unknown());

const globeResponseSchema = z
  .object({
    timestamp: z.number(),
    icao: z.string().optional(),
    hex: z.string().optional(),
    trace: z.array(tracePointSchema),
  })
  .loose();

export interface TrackProviderResult {
  raw: ArrayBuffer;
  segments: FlightSegment[];
  providerFlightIdPrefix: string;
  aircraftIcao: string;
  sourceDate: string;
}

export interface TrackProvider {
  fetchDay(date: string, icao: string, env: Env): Promise<TrackProviderResult | null>;
}

export function parseGlobeHistoryDay(
  raw: ArrayBuffer,
  date: string,
  icao: string,
): TrackProviderResult {
  const normalizedIcao = icao.trim().toLocaleLowerCase();
  const parsed = globeResponseSchema.parse(
    JSON.parse(new TextDecoder().decode(raw)),
  ) as GlobeTraceResponse;
  return {
    raw,
    segments: splitTrace(absoluteTracePoints(parsed)),
    providerFlightIdPrefix: `globe:${normalizedIcao}:${date}`,
    aircraftIcao: normalizedIcao,
    sourceDate: date,
  };
}

async function boundedArrayBuffer(response: Response): Promise<ArrayBuffer> {
  const declared = Number.parseInt(response.headers.get("content-length") || "", 10);
  if (declared > MAX_RAW_RESPONSE_BYTES) throw new Error("Globe response exceeded 32 MiB.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RAW_RESPONSE_BYTES) throw new Error("Globe response exceeded 32 MiB.");
  return buffer;
}

export const globeHistoryProvider: TrackProvider = {
  async fetchDay(date, icao, env) {
    const normalizedIcao = icao.trim().toLocaleLowerCase();
    const datePath = date.replaceAll("-", "/");
    const endpoint = `${env.GLOBE_API_BASE_URL.replace(/\/+$/, "")}/globe_history/${datePath}/traces/${normalizedIcao.slice(-2)}/trace_full_${normalizedIcao}.json`;
    const headers = new Headers({
      accept: "application/json",
      referer: `${env.GLOBE_API_BASE_URL}/?icao=${normalizedIcao}&showTrace=${date}`,
      "user-agent": "GoldenDomeAirways/2.0 public-records-research",
    });
    if (env.GLOBE_API_KEY) {
      headers.set("x-api-key", env.GLOBE_API_KEY);
    }
    const response = await fetch(endpoint, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Globe history failed with ${response.status}.`);
    const raw = await boundedArrayBuffer(response);
    return parseGlobeHistoryDay(raw, date, normalizedIcao);
  },
};
