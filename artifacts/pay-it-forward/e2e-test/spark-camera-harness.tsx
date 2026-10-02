import { useState } from "react";
import { createRoot } from "react-dom/client";
import { StoryCameraRecorder } from "../src/components/community/StoryCameraRecorder";

function SparkCameraHarness() {
  const [result, setResult] = useState<string | null>(null);

  if (result !== null) {
    return <main><output data-testid="result-spark-camera">{result}</output></main>;
  }

  return <StoryCameraRecorder
    allowText={false}
    onCancel={() => setResult("cancelled")}
    onGallery={() => setResult("gallery")}
    onText={() => setResult("text")}
    onUse={(files) => setResult(files.map((file) => `${file.type}:${file.size}`).join(","))}
  />;
}

createRoot(document.getElementById("root")!).render(<SparkCameraHarness />);