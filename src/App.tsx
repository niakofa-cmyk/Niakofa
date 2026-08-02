import { useRoute } from "@/lib/router";
import LegacyHub from "@/pages/LegacyHub";
import LegacyStart from "@/pages/LegacyStart";
import LegacyChapter from "@/pages/LegacyChapter";
import LegacyMap from "@/pages/LegacyMap";
import LegacyAchievements from "@/pages/LegacyAchievements";
import LegacyWorldEvolution from "@/pages/LegacyWorldEvolution";
import LegacyTimeline from "@/pages/LegacyTimeline";

export default function App() {
  const [route] = useRoute();

  switch (route.name) {
    case "hub": return <LegacyHub />;
    case "start": return <LegacyStart />;
    case "chapter": return <LegacyChapter chapterId={route.chapterId} />;
    case "map": return <LegacyMap />;
    case "achievements": return <LegacyAchievements />;
    case "world-evolution": return <LegacyWorldEvolution />;
    case "timeline": return <LegacyTimeline />;
    default: return <LegacyHub />;
  }
}
