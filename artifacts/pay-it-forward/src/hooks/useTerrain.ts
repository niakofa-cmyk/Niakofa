import { useEffect, type RefObject } from "react";
import type * as mapboxgl from "mapbox-gl";

export function useTerrain(mapRef: RefObject<mapboxgl.Map | null>): void {
  useEffect(() => {
    let removed = false;
    let pollId: ReturnType<typeof setInterval> | null = null;

    function setup() {
      if (removed) return;
      const m = mapRef.current;
      if (!m) return;

      if (!m.getSource("mapbox-dem")) {
        m.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      m.setTerrain({ source: "mapbox-dem", exaggeration: 1.4 });

      if (!m.getLayer("niakofa-3d-buildings")) {
        m.addLayer(
          {
            id: "niakofa-3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 14,
            paint: {
              "fill-extrusion-color": [
                "interpolate",
                ["linear"],
                ["get", "height"],
                0,   "hsl(222, 47%, 7%)",
                100, "hsl(216, 34%, 14%)",
                300, "hsl(210, 30%, 20%)",
              ],
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.72,
            },
          },
          "road-label-simple"
        );
      }
    }

    function tryAttach() {
      const map = mapRef.current;
      if (!map) return false;

      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }

      if (map.isStyleLoaded()) {
        setup();
      } else {
        map.once("load", setup);
      }
      return true;
    }

    if (!tryAttach()) {
      pollId = setInterval(() => {
        if (removed) return;
        tryAttach();
      }, 200);
    }

    return () => {
      removed = true;
      if (pollId) clearInterval(pollId);
      const m = mapRef.current;
      if (!m || !m.isStyleLoaded()) return;
      try {
        if (m.getLayer("niakofa-3d-buildings")) m.removeLayer("niakofa-3d-buildings");
        if (m.getTerrain()) m.setTerrain(null);
        if (m.getSource("mapbox-dem")) m.removeSource("mapbox-dem");
      } catch {
        // Map may already be destroyed
      }
    };
  }, [mapRef]);
}
