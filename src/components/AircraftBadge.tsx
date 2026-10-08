import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AircraftType = "Airplane" | "Helicopter";

export default function AircraftBadge({
  tailNo,
  type,
  href,
  size = "default",
  className,
}: {
  tailNo: string;
  type: AircraftType;
  href?: string;
  size?: "default" | "compact";
  className?: string;
}) {
  const content = (
    <>
      {tailNo}
      <span aria-hidden="true">{type === "Helicopter" ? "🚁" : "✈️"}</span>
    </>
  );
  const classes = cn(
    "h-auto gap-1 rounded-[.35rem] font-[850] tracking-[.01em] no-underline hover:no-underline [&>span]:text-[.9em] [&>span]:leading-none",
    type === "Helicopter"
      ? "!text-white dark:!text-[#e2f1ff]"
      : "!text-[var(--navy-950)]",
    size === "compact"
      ? "min-h-5 px-[.42rem] py-[.16rem] text-xs"
      : "min-h-8 px-[.68rem] py-[.38rem] text-base",
    "leading-none",
    className,
  );

  if (href) {
    return (
      <Badge asChild variant={type === "Helicopter" ? "helicopter" : "gold"} className={classes}>
        <a href={href}>{content}</a>
      </Badge>
    );
  }

  return (
    <Badge variant={type === "Helicopter" ? "helicopter" : "gold"} className={classes}>
      {content}
    </Badge>
  );
}
