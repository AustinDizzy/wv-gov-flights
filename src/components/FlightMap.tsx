import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Slider } from "@/components/ui/slider";
import type {
  Feature,
  GeoJsonProperties,
  LineString,
  MultiLineString,
} from "geojson";

type FlightFeature = Feature<LineString | MultiLineString, GeoJsonProperties>;
type Vehicle = "airplane" | "helicopter";
type MapLink = { label: string; href: string };
type Point = [number, number];

interface Props {
  features: FlightFeature[];
  title?: string;
  vehicle?: Vehicle;
  externalLinks?: MapLink[];
  playback?: boolean;
  showToolbar?: boolean;
  className?: string;
}

const colors = ["#b98014", "#2a76c6", "#176b4b", "#914e9e", "#b44949", "#0b7d86"];
const activeColor = "#e09b1c";
const resetIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
const fullscreenIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="M9 21H3v-6"/><path d="m3 21 7-7"/></svg>';
const exitFullscreenIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 14 6 0 0 6"/><path d="m10 14-7 7"/><path d="m20 10-6 0 0-6"/><path d="m14 10 7-7"/></svg>';
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);

export default function FlightMap({
  features,
  title = "Recorded flight path",
  vehicle = "airplane",
  externalLinks = [],
  playback = true,
  showToolbar = true,
  className = "",
}: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map>();
  const routeGroupRef = useRef<import("leaflet").FeatureGroup>();
  const layersRef = useRef<import("leaflet").GeoJSON[]>([]);
  const heatLayerRef = useRef<import("leaflet").Layer>();
  const markerRef = useRef<import("leaflet").Marker>();
  const fitAllRef = useRef<() => void>(() => undefined);
  const animationRef = useRef<number>();
  const progressRef = useRef(0);
  const updateMarkerRef = useRef<(progress: number) => void>(() => undefined);
  const fullscreenControlRef = useRef<HTMLAnchorElement>();
  const pseudoFullscreenRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activePath, setActivePath] = useState<number | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const coordinateGroups = useMemo(
    () =>
      features.flatMap((feature) =>
        feature.geometry.type === "MultiLineString"
          ? feature.geometry.coordinates
          : [feature.geometry.coordinates],
      ),
    [features],
  );
  const playbackPoints = useMemo(
    () =>
      coordinateGroups
        .flat()
        .filter((coordinate) => coordinate.length >= 2)
        .map((coordinate) => [coordinate[1], coordinate[0]] as Point),
    [coordinateGroups],
  );
  const canPlay = playback && features.length === 1 && playbackPoints.length > 1;
  const heatPoints = useMemo(
    () =>
      coordinateGroups
        .flat()
        .filter((coordinate) => coordinate.length >= 2)
        .map(([longitude, latitude]) => [latitude, longitude, 1] as [number, number, number]),
    [coordinateGroups],
  );
  const canHeatmap = features.length > 1 && heatPoints.length > 0;

  useEffect(() => {
    let disposed = false;
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === wrapper.current || pseudoFullscreenRef.current);
      window.setTimeout(() => mapRef.current?.invalidateSize(), 50);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    void import("leaflet").then(async (L) => {
      if (disposed || !element.current) return;

      // leaflet.heat is a legacy browser-global plugin. Point it at the same
      // Leaflet module instance used to create this map before loading it.
      // Without this, Vite can load the plugin before a global `L` exists and
      // leave `L.heatLayer` undefined in the browser.
      Object.assign(window, { L });
      await import("leaflet.heat");
      if (disposed || !element.current) return;

      const map = L.map(element.current, {
        scrollWheelZoom: false,
        zoomControl: true,
        preferCanvas: true,
      });
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const allLayers = L.featureGroup();
      routeGroupRef.current = allLayers;
      layersRef.current = features.map((feature, index) => {
        const color = feature.properties?.color ?? colors[index % colors.length];
        const layer = L.geoJSON(feature, {
          style: {
            color,
            weight: features.length === 1 ? 4 : 3,
            opacity: features.length === 1 ? 0.92 : 0.68,
            lineCap: "round",
            lineJoin: "round",
          },
        }).addTo(allLayers);

        const label = feature.properties?.label ?? `Recorded path ${index + 1}`;
        const detail = feature.properties?.detail;
        layer.bindPopup(
          `<strong>${escapeHtml(label)}</strong>${detail ? `<div>${escapeHtml(detail)}</div>` : ""}`,
        );

        const lines =
          feature.geometry.type === "MultiLineString"
            ? feature.geometry.coordinates
            : [feature.geometry.coordinates];
        const first = lines[0]?.[0];
        const last = lines.at(-1)?.at(-1);
        if (first) {
          L.circleMarker([first[1], first[0]], {
            radius: 4,
            color,
            fillColor: "#fff",
            fillOpacity: 1,
            weight: 2,
          }).addTo(allLayers);
        }
        if (last) {
          L.circleMarker([last[1], last[0]], {
            radius: 5,
            color: "#fff",
            fillColor: color,
            fillOpacity: 1,
            weight: 2,
          }).addTo(allLayers);
        }
        return layer;
      });

      if (canPlay) {
        const icon = L.divIcon({
          className: "grid place-items-center border-0 bg-transparent [filter:drop-shadow(0_1px_1px_rgb(255_255_255_/_95%))_drop-shadow(0_2px_3px_rgb(0_0_0_/_40%))] [&>span]:block [&>span]:text-[1.6rem] [&>span]:leading-none",
          html: `<span aria-hidden="true">${vehicle === "helicopter" ? "🚁" : "✈️"}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        markerRef.current = L.marker(playbackPoints[0], {
          icon,
          interactive: false,
          keyboard: false,
          zIndexOffset: 500,
        }).addTo(allLayers);
        updateMarkerRef.current = (nextProgress) => {
          if (!markerRef.current) return;
          const scaled = Math.max(0, Math.min(1, nextProgress)) * (playbackPoints.length - 1);
          const index = Math.min(Math.floor(scaled), playbackPoints.length - 2);
          const amount = scaled - index;
          const from = playbackPoints[index];
          const to = playbackPoints[index + 1];
          markerRef.current.setLatLng([
            from[0] + (to[0] - from[0]) * amount,
            from[1] + (to[1] - from[1]) * amount,
          ]);
        };
      }

      if (canHeatmap) {
        heatLayerRef.current = L.heatLayer(heatPoints, {
          radius: 20,
          blur: 15,
          maxZoom: 17,
          gradient: { 0.4: "#2a76c6", 0.6: "#176b4b", 0.8: "#f0cc71", 1: "#b44949" },
        });
      }
      allLayers.addTo(map);

      fitAllRef.current = () => {
        const bounds = allLayers.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
        else map.setView([38.6, -80.6], 6);
      };

      const actionsControl = new L.Control({ position: "topright" });
      actionsControl.onAdd = () => {
        const control = L.DomUtil.create("div", "leaflet-bar flex");
        const addAction = (label: string, icon: string, action: () => void) => {
          const button = L.DomUtil.create(
            "a",
            "grid! place-items-center rounded-none! border-r border-[#ccc] border-b-0! first:rounded-l-[4px]! last:rounded-r-[4px]! last:border-r-0 [&_svg]:size-4 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]",
            control,
          ) as HTMLAnchorElement;
          button.href = "#";
          button.title = label;
          button.setAttribute("aria-label", label);
          button.innerHTML = icon;
          L.DomEvent.on(button, "click", (event) => {
            L.DomEvent.stop(event);
            action();
          });
          return button;
        };

        addAction("Reset map view", resetIcon, () => resetMapView());
        fullscreenControlRef.current = addAction("View map full screen", fullscreenIcon, () => {
          void toggleFullscreen();
        });
        return control;
      };
      actionsControl.addTo(map);
      fitAllRef.current();
      setReady(true);
    });

    return () => {
      disposed = true;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      mapRef.current?.remove();
      mapRef.current = undefined;
      markerRef.current = undefined;
      routeGroupRef.current = undefined;
      layersRef.current = [];
      heatLayerRef.current = undefined;
      fullscreenControlRef.current = undefined;
      updateMarkerRef.current = () => undefined;
      setReady(false);
      setPlaying(false);
    };
  }, [canHeatmap, canPlay, features, heatPoints, playbackPoints, vehicle]);

  useEffect(() => {
    const map = mapRef.current;
    const routeGroup = routeGroupRef.current;
    const heatLayer = heatLayerRef.current;
    if (!ready || !map || !routeGroup || !heatLayer) return;

    if (showHeatmap) {
      map.removeLayer(routeGroup);
      heatLayer.addTo(map);
    } else {
      map.removeLayer(heatLayer);
      routeGroup.addTo(map);
    }
  }, [ready, showHeatmap]);

  const focusPath = (index: number) => {
    const map = mapRef.current;
    const layer = layersRef.current[index];
    if (!map || !layer) return;
    setActivePath(index);
    layersRef.current.forEach((routeLayer, routeIndex) => {
      routeLayer.setStyle({
        color: routeIndex === index ? activeColor : colors[routeIndex % colors.length],
        weight: routeIndex === index ? 5 : 3,
        opacity: routeIndex === index ? 1 : 0.32,
      });
    });
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    layer.openPopup();
  };

  const resetMapView = () => {
    const map = mapRef.current;
    stopPlayback();
    seek(0);
    setActivePath(null);
    layersRef.current.forEach((routeLayer, routeIndex) => {
      routeLayer.setStyle({
        color: colors[routeIndex % colors.length],
        weight: features.length === 1 ? 4 : 3,
        opacity: features.length === 1 ? 0.92 : 0.68,
      });
    });
    map?.closePopup();
    fitAllRef.current();
  };

  const seek = (nextProgress: number) => {
    const bounded = Math.max(0, Math.min(1, nextProgress));
    progressRef.current = bounded;
    setProgress(bounded);
    updateMarkerRef.current(bounded);
  };

  const stopPlayback = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = undefined;
    setPlaying(false);
  };

  const togglePlayback = () => {
    if (playing) {
      stopPlayback();
      return;
    }
    if (progressRef.current >= 1) seek(0);
    setPlaying(true);
    const duration = 14_000;
    const start = performance.now() - progressRef.current * duration;
    const advance = (now: number) => {
      const next = Math.min(1, (now - start) / duration);
      seek(next);
      if (next < 1) animationRef.current = requestAnimationFrame(advance);
      else {
        animationRef.current = undefined;
        setPlaying(false);
      }
    };
    animationRef.current = requestAnimationFrame(advance);
  };

  const toggleFullscreen = async () => {
    const target = wrapper.current;
    if (!target) return;

    const setPseudoFullscreen = (enabled: boolean) => {
      pseudoFullscreenRef.current = enabled;
      document.body.style.overflow = enabled ? "hidden" : "";
      setFullscreen(enabled);
      requestAnimationFrame(() => mapRef.current?.invalidateSize());
    };

    if (pseudoFullscreenRef.current) {
      setPseudoFullscreen(false);
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    try {
      if (!target.requestFullscreen) throw new Error("Fullscreen API unavailable");
      await target.requestFullscreen();
      if (document.fullscreenElement !== target) setPseudoFullscreen(true);
    } catch {
      // iOS and embedded browsers may not offer element fullscreen. Fill the
      // viewport instead so the map remains usable on those devices.
      setPseudoFullscreen(true);
    }
  };

  useEffect(() => {
    const button = fullscreenControlRef.current;
    if (!button) return;
    const label = fullscreen ? "Exit full screen" : "View map full screen";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = fullscreen ? exitFullscreenIcon : fullscreenIcon;
  }, [fullscreen]);

  useEffect(() => () => {
    document.body.style.overflow = "";
  }, []);

  const showPaths = features.length > 1 && features.length <= 10 && !showHeatmap;
  const playbackLabel = playing ? "Pause" : progress > 0 && progress < 1 ? "Resume" : "Play";
  const PlaybackIcon = playing ? Pause : Play;

  return (
    <div
      className={`relative isolate z-0 overflow-hidden rounded-lg border border-border bg-surface shadow-card fullscreen:flex fullscreen:flex-col fullscreen:rounded-none fullscreen:border-0 fullscreen:bg-surface [&:fullscreen_[data-map-canvas]]:min-h-0 [&:fullscreen_[data-map-canvas]]:flex-1 data-[pseudo-fullscreen=true]:fixed data-[pseudo-fullscreen=true]:inset-0 data-[pseudo-fullscreen=true]:z-[2000] data-[pseudo-fullscreen=true]:flex data-[pseudo-fullscreen=true]:h-dvh data-[pseudo-fullscreen=true]:w-dvw data-[pseudo-fullscreen=true]:flex-col data-[pseudo-fullscreen=true]:rounded-none data-[pseudo-fullscreen=true]:border-0 data-[pseudo-fullscreen=true]:bg-surface data-[pseudo-fullscreen=true]:[&_[data-map-canvas]]:min-h-0 data-[pseudo-fullscreen=true]:[&_[data-map-canvas]]:flex-1 [&_.leaflet-tile-pane]:[filter:grayscale(1)_contrast(.9)_brightness(1.08)] dark:[&_.leaflet-tile-pane]:[filter:grayscale(1)_invert(.87)_hue-rotate(180deg)_brightness(.72)_contrast(.86)] [&_.leaflet-popup-content_strong]:mb-[.2rem] [&_.leaflet-popup-content_strong]:block [&_.leaflet-popup-content_div]:text-[.75rem] [&_.leaflet-popup-content_div]:text-[#5c6c76] ${className}`}
      data-pseudo-fullscreen={pseudoFullscreenRef.current ? "true" : undefined}
      ref={wrapper}
    >
      {showToolbar && (
        <div className="flex min-h-12 items-center justify-between gap-4 border-b border-border px-[.7rem] py-2" aria-label="Map controls">
          <strong className="text-[.78rem]">{title}</strong>
        </div>
      )}
      {showPaths && (
        <div className="flex gap-[.35rem] overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:thin]" aria-label="Recorded flight paths">
          {features.map((feature, index) => (
            <Button
              type="button"
              variant={activePath === index ? "default" : "outline"}
              size="xs"
              onClick={() => focusPath(index)}
              className="shrink-0 gap-[.35rem] px-2 py-[.3rem] text-[.66rem]"
              aria-pressed={activePath === index}
              key={index}
            >
              <i className="h-[.18rem] w-[.55rem] rounded-full" style={{ background: activePath === index ? activeColor : feature.properties?.color ?? colors[index % colors.length] }} />
              {feature.properties?.label ?? `Path ${index + 1}`}
            </Button>
          ))}
        </div>
      )}
      <div ref={element} data-map-canvas className="z-0 min-h-[23rem] overflow-hidden bg-[var(--sky-100)] font-[inherit]" aria-label={`${title} interactive map`} />
      {(canPlay || canHeatmap || externalLinks.length > 0) && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-[.55rem] border-t border-border bg-surface px-[.65rem] py-[.45rem] max-[560px]:items-start max-[560px]:flex-col">
          <div className="flex flex-wrap items-center gap-x-[.8rem] gap-y-[.3rem] max-[560px]:items-start max-[560px]:flex-col">
            {externalLinks.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-[.8rem] gap-y-[.3rem] [&_a]:text-[.65rem] [&_a]:font-[750] [&_a]:whitespace-nowrap [&_a]:no-underline [&_a_span]:text-gold-500" aria-label="External flight tracking links">
                <span className="text-[.6rem] font-extrabold tracking-[.06em] text-muted-foreground uppercase">Sources</span>
                {externalLinks.map((link) => (
                  <a href={link.href} rel="noopener noreferrer" target="_blank" key={link.href}>
                    {link.label} <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          {(canHeatmap || canPlay) && (
            <div className="ml-auto flex items-center gap-[.45rem] max-[560px]:ml-0 max-[560px]:w-full [&_button]:min-w-[4.25rem] [&_button]:text-[.65rem] [&_button]:font-extrabold max-[560px]:[&_button]:min-w-[3.7rem]">
              {canPlay && (
                <div className="flex w-[clamp(9rem,20vw,14rem)] items-center max-[560px]:w-auto max-[560px]:flex-[1_1_12rem]">
                  <Slider
                    className="min-w-0 [&_[data-slot=slider-track]]:h-[.42rem] [&_[data-slot=slider-track]]:bg-[color-mix(in_srgb,var(--primary)_24%,var(--ui-muted))] [&_[data-slot=slider-range]]:bg-gold-500 [&_[data-slot=slider-thumb]]:border-gold-500 [&_[data-slot=slider-thumb]]:bg-gold-300"
                    min={0}
                    max={100}
                    step={0.5}
                    value={[progress * 100]}
                    disabled={!ready}
                    thumbLabel="Flight playback position"
                    onValueChange={([value = 0]) => {
                      if (playing) stopPlayback();
                      seek(value / 100);
                    }}
                  />
                </div>
              )}
              <ButtonGroup>
              {canHeatmap && (
                <Button size="sm" variant="outline" type="button" onClick={() => setShowHeatmap((current) => !current)} disabled={!ready}>
                  <Flame size={14} aria-hidden={true} />
                  <span>{showHeatmap ? "Show routes" : "Toggle heatmap"}</span>
                </Button>
              )}
              {canPlay && <>
              <Button size="sm" variant="outline" type="button" onClick={togglePlayback} disabled={!ready}>
                <PlaybackIcon size={14} aria-hidden={true} />
                <span>{playbackLabel}</span>
              </Button>
              </>}
              </ButtonGroup>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
