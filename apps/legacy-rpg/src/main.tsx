import "pixi.js/unsafe-eval";
import { createRoot } from "react-dom/client";
import { LegacyGameCanvas } from "./game/LegacyGameCanvas";
import {
  mensahCompoundAssets,
  mensahCompoundBaseUrl,
  mensahCompoundScene,
  MENSAH_COMPOUND_SPAWN,
} from "./game/scene-mensah-compound";
import { KWAME_SHEET_MANIFEST } from "./game/kwame-sheet-manifest";
import { getLegacyLaunchContext } from "./integration/niakofa-bridge";
import "./styles.css";

const context = getLegacyLaunchContext();

createRoot(document.getElementById("root")!).render(
  <main className="legacy-app">
    <LegacyGameCanvas
      scene={mensahCompoundScene}
      environmentAssets={mensahCompoundAssets}
      environmentBaseUrl={mensahCompoundBaseUrl}
      characterManifest={KWAME_SHEET_MANIFEST}
      gameHour={context.gameHour ?? 14}
      initialSpawn={MENSAH_COMPOUND_SPAWN}
    />
    <div className="legacy-badge" aria-label="Niakofa Legacy mock mode">
      <strong>LEGACY</strong>
      <span>{context.mode === "live" ? "Family session" : "Mock Kwame"}</span>
    </div>
  </main>,
);