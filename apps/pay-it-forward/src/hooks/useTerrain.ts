import { useEffect } from "react";
import type { Map } from "mapbox-gl";

export function useTerrain(map: Map | null, enabled = true) {
  useEffect(() => {
    if (!map || !enabled) return;

    function addLayers() {
      if (!map) return;

      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.2 });

      map.setFog({
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.6,
      });

      if (!map.getLayer("3d-buildings")) {
        const labelLayer = map
          .getStyle()
          .layers.find(
            (l) => l.type === "symbol" && l.layout &&
              (l.layout as Record<string, unknown>)["text-field"]
          );
        map.addLayer(
          {
            id: "3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 14,
            paint: {
              "fill-extrusion-color": "#aaa",
              "fill-extrusion-height": [
                "interpolate", ["linear"], ["zoom"],
                14, 0,
                14.05, ["get", "height"],
              ],
              "fill-extrusion-base": [
                "interpolate", ["linear"], ["zoom"],
                14, 0,
                14.05, ["get", "min_height"],
              ],
              "fill-extrusion-opacity": 0.7,
            },
          },
          labelLayer?.id
        );
      }
    }

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once("style.load", addLayers);
    }
  }, [map, enabled]);
}
