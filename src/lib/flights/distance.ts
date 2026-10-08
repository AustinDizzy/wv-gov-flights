import type { Feature, LineString, MultiLineString, Position } from "geojson";
import { safeJson } from "../utils";

type FlightGeometry = Feature<LineString | MultiLineString>;

const validCoordinate = (coordinate: Position) => {
  const [longitude, latitude] = coordinate;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
};

const lineDistanceMetres = (coordinates: Position[]) => {
  let distance = 0;
  let previous: Position | undefined;

  for (const coordinate of coordinates) {
    if (!validCoordinate(coordinate)) {
      previous = undefined;
      continue;
    }
    if (previous) {
      const [previousLongitude, previousLatitude] = previous;
      const [longitude, latitude] = coordinate;
      const radians = Math.PI / 180;
      const latitudeDelta = (latitude - previousLatitude) * radians;
      const longitudeDelta = (longitude - previousLongitude) * radians;
      const a = Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(previousLatitude * radians) * Math.cos(latitude * radians) *
        Math.sin(longitudeDelta / 2) ** 2;
      distance += 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    previous = coordinate;
  }

  return distance;
};

export function observedDistanceMetres(geometryJson: string | null | undefined): number {
  const feature = safeJson<FlightGeometry | null>(geometryJson, null);
  if (!feature) return 0;

  const lines = feature.geometry.type === "LineString"
    ? [feature.geometry.coordinates]
    : feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates
      : [];
  return lines.reduce((total, line) => total + lineDistanceMetres(line), 0);
}
