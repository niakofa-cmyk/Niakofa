import { useState } from "react";
import { ArrowRight, Camera, ImagePlus, Type, X } from "lucide-react";
import "./_group.css";
import "./direction.css";

export function SparkStudioDirection() {
  const [notice, setNotice] = useState("");
  const [showWords, setShowWords] = useState(false);

  return (
    <main className="spark-studio-direction">
      <header className="spark-direction-header">
        <button type="button" className="spark-direction-icon" aria-label="Close Spark Studio" onClick={() => setNotice("Spark Studio preview")}>
          <X size={19} />
        </button>
        <div className="spark-direction-title">
          <span className="spark-direction-eyebrow">01 / MAKE A SPARK</span>
          <strong>Spark Studio</strong>
        </div>
        <span className="spark-direction-header-spacer" aria-hidden="true" />
      </header>

      <section className="spark-direction-content">
        <div className="spark-direction-intro">
          <p className="spark-direction-kicker">A little life, shared</p>
          <h1>What’s happening<br /><em>around you?</em></h1>
          <p>Give your neighbors a window into your day.</p>
        </div>

        <button type="button" className="spark-direction-capture" onClick={() => setNotice("Camera preview selected")}>
          <img
            src="https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1100&q=82"
            alt=""
          />
          <span className="spark-direction-capture-shade" />
          <span className="spark-direction-capture-badge"><Camera size={17} /> PHOTO OR VIDEO</span>
          <span className="spark-direction-capture-copy">
            <strong>Capture a moment</strong>
            <small>Open your camera</small>
          </span>
          <span className="spark-direction-capture-arrow"><ArrowRight size={19} /></span>
        </button>

        <button type="button" className="spark-direction-gallery" onClick={() => setNotice("Gallery preview selected")}>
          <span className="spark-direction-gallery-icon"><ImagePlus size={21} /></span>
          <span><strong>Choose from your gallery</strong><small>Photos and videos on this device</small></span>
          <ArrowRight size={19} />
        </button>

        <button type="button" className="spark-direction-words" onClick={() => setShowWords((visible) => !visible)}>
          <span className="spark-direction-words-icon"><Type size={17} /></span>
          <span>{showWords ? "Keep adding words" : "Start with words instead"}</span>
          <ArrowRight size={16} />
        </button>
        {showWords && <div className="spark-direction-words-panel">
          <label htmlFor="spark-direction-caption">Your Spark</label>
          <textarea id="spark-direction-caption" placeholder="A small thing worth sharing…" />
        </div>}
      </section>

      <footer className="spark-direction-footer">
        <span className="spark-direction-privacy-mark" aria-hidden="true">✦</span>
        <p>Your Spark is shared only with the audience you choose.</p>
      </footer>
      <span className="spark-direction-status" aria-live="polite">{notice}</span>
    </main>
  );
}