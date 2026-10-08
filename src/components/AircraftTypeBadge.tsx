import { Badge } from "@/components/ui/badge";

type AircraftType = "Airplane" | "Helicopter";

export default function AircraftTypeBadge({ type }: { type: AircraftType }) {
  return (
    <Badge variant={type === "Helicopter" ? "helicopter" : "gold"}>
      {type.toLowerCase()}
    </Badge>
  );
}
