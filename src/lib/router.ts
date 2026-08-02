import { useState, useEffect, useCallback } from "react";

export type Route =
  | { name: "hub" }
  | { name: "start" }
  | { name: "chapter"; chapterId: string }
  | { name: "map" }
  | { name: "achievements" }
  | { name: "world-evolution" }
  | { name: "journal" }
  | { name: "timeline" };

export function useRoute(): [Route, (path: string) => void] {
  const parse = useCallback((hash: string): Route => {
    const h = hash.replace(/^#\/?/, "").trim();
    if (!h || h === "legacy") return { name: "hub" };
    if (h === "legacy/start") return { name: "start" };
    if (h.startsWith("legacy/chapter/")) return { name: "chapter", chapterId: h.split("/")[2] };
    if (h === "legacy/map") return { name: "map" };
    if (h === "legacy/achievements") return { name: "achievements" };
    if (h === "legacy/world-evolution") return { name: "world-evolution" };
    if (h === "legacy/journal") return { name: "journal" };
    if (h === "legacy/timeline") return { name: "timeline" };
    return { name: "hub" };
  }, []);

  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [parse]);

  const navigate = useCallback((path: string) => {
    window.location.hash = path.startsWith("#") ? path : `#/${path.replace(/^\//, "")}`;
  }, []);

  return [route, navigate];
}
