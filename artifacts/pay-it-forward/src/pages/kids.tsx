import "./kids.css";

type SparkProps = { className?: string };

function OrbitMark({ className = "" }: SparkProps) {
  return (
    <svg className={className} viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <circle cx="36" cy="36" r="25" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="36" cy="36" rx="33" ry="12" stroke="currentColor" strokeWidth="2" transform="rotate(-32 36 36)" />
      <circle cx="57" cy="18" r="5" fill="currentColor" />
      <circle cx="20" cy="51" r="3" fill="currentColor" />
    </svg>
  );
}

function KidsHeader({ projectPage = false }: { projectPage?: boolean }) {
  return (
    <header className="kids-header" data-testid="kids-header">
      <a className="kids-wordmark" href="/kids/" data-testid="link-kids-home-brand" aria-label="Niakofa Kids home">
        <span className="kids-wordmark-mark" aria-hidden="true">n.</span>
        <span>niakofa<span className="kids-wordmark-kids">kids</span></span>
      </a>
      <nav aria-label="Main navigation" className="kids-nav">
        <a href={projectPage ? "/kids/#our-world" : "#our-world"} data-testid="link-kids-our-world">Our world</a>
        <a href={projectPage ? "/kids/#for-grownups" : "#for-grownups"} data-testid="link-kids-for-grownups">For grown-ups</a>
        <a className="kids-nav-feature" href={projectPage ? "/kids/" : "/kids/wfm"} data-testid="link-kids-war-for-mars">{projectPage ? "Kids home" : "War for Mars"} <span aria-hidden="true">{projectPage ? "↗" : "↗"}</span></a>
      </nav>
    </header>
  );
}

function SparkMark({ className = "" }: SparkProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 2.5 19.5 12.5 29.5 16 19.5 19.5 16 29.5 12.5 19.5 2.5 16 12.5 12.5 16 2.5Z" fill="currentColor" />
    </svg>
  );
}

function KidsFooter() {
  return (
    <footer className="kids-footer" data-testid="kids-footer">
      <a className="kids-wordmark kids-wordmark-footer" href="/kids/" data-testid="link-kids-footer-home">
        <span className="kids-wordmark-mark" aria-hidden="true">n.</span>
        <span>niakofa<span className="kids-wordmark-kids">kids</span></span>
      </a>
      <p>Help today. Pay it forward tomorrow.</p>
      <a href="/kids/wfm" data-testid="link-footer-war-for-mars">Meet War for Mars <span aria-hidden="true">↗</span></a>
    </footer>
  );
}

function KiteIllustration() {
  return (
    <svg className="kids-kite-art" viewBox="0 0 570 460" role="img" aria-labelledby="kite-title kite-desc">
      <title id="kite-title">A bright little world in motion</title>
      <desc id="kite-desc">A coral kite circles a sunny yellow planet beneath a field of tiny stars.</desc>
      <circle cx="328" cy="219" r="154" fill="#DFF7F6" />
      <circle cx="326" cy="218" r="115" fill="#FFC94A" />
      <path d="M229 207c24-35 57-53 98-53 40 0 72 17 96 50-26 17-57 26-94 26-38 0-71-8-100-23Z" fill="#FF735D" />
      <path d="M242 265c25 27 55 41 90 41 35 0 65-14 88-41-27-19-57-28-89-28-33 0-63 9-89 28Z" fill="#F08C79" />
      <ellipse cx="322" cy="219" rx="160" ry="58" fill="none" stroke="#102B47" strokeWidth="3" transform="rotate(-23 322 219)" />
      <circle cx="452" cy="158" r="11" fill="#00CFFF" stroke="#102B47" strokeWidth="3" />
      <path d="m129 124 66 42-63 50-3-92Z" fill="#FF735D" stroke="#102B47" strokeWidth="4" strokeLinejoin="round" />
      <path d="m133 128 4 79 56-41-60-38Z" fill="#FFAB98" />
      <path d="M129 216c-25 28-10 41 8 28 19-14 27-3 11 12-15 14-1 27 14 12" fill="none" stroke="#102B47" strokeWidth="3" strokeLinecap="round" />
      <path d="M129 217c3 45 17 66 41 66" fill="none" stroke="#102B47" strokeWidth="2" strokeDasharray="4 7" />
      <path d="m102 86 5 13 13 5-13 5-5 13-5-13-13-5 13-5 5-13Zm371 145 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z" fill="#00A9C7" />
      <circle cx="184" cy="325" r="5" fill="#FF735D" />
      <circle cx="477" cy="92" r="4" fill="#FF735D" />
      <path d="M104 347c34-28 67-40 101-37" fill="none" stroke="#00A9C7" strokeWidth="3" strokeLinecap="round" />
      <path d="M419 365c25-26 49-37 74-33" fill="none" stroke="#FF735D" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CommunityIllustration() {
  return (
    <svg viewBox="0 0 520 340" className="community-art" role="img" aria-labelledby="community-title community-desc">
      <title id="community-title">Small acts, shared in a circle</title>
      <desc id="community-desc">Three abstract colorful figures share a glowing circle.</desc>
      <circle cx="260" cy="171" r="126" fill="#DDF6F2" />
      <circle cx="260" cy="171" r="78" fill="#FFC94A" />
      <path d="M230 174c11-28 30-42 57-42 17 0 31 7 43 21-11 34-31 51-62 51-19 0-34-10-45-30" fill="#FF735D" />
      <circle cx="190" cy="119" r="29" fill="#00B6C9" />
      <path d="M141 252c4-55 20-83 49-83s46 28 50 83" fill="#102B47" />
      <circle cx="323" cy="116" r="27" fill="#FF9F89" />
      <path d="M279 252c4-52 18-78 44-78s42 26 46 78" fill="#00AFC5" />
      <circle cx="260" cy="83" r="7" fill="#FF735D" />
      <path d="m256 84-16-28m18 27 19-28" stroke="#102B47" strokeWidth="3" strokeLinecap="round" />
      <path d="M90 273c32 18 64 23 95 14m151 5c36 6 67 0 96-18" fill="none" stroke="#102B47" strokeWidth="3" strokeLinecap="round" />
      <circle cx="105" cy="89" r="5" fill="#00AFC5" />
      <circle cx="407" cy="94" r="6" fill="#FF735D" />
      <path d="m404 241 5 11 11 5-11 5-5 11-5-11-11-5 11-5 5-11Z" fill="#FFC94A" />
    </svg>
  );
}

export function KidsHomePage() {
  return (
    <div className="kids-site">
      <a className="kids-skip-link" href="#kids-main" data-testid="link-kids-skip-main">Skip to content</a>
      <KidsHeader />
      <main id="kids-main">
        <section className="kids-hero" aria-labelledby="kids-title" data-testid="section-kids-hero">
          <div className="kids-hero-copy">
            <p className="kids-eyebrow"><span className="eyebrow-dot" /> A little corner of the global village</p>
            <h1 id="kids-title">Big-hearted<br /><em>little worlds.</em></h1>
            <p className="kids-hero-lede">A place for families to discover stories, ideas and playful projects shaped by the belief that good things travel further when we share them.</p>
            <a className="kids-pill-link" href="#our-world" data-testid="link-kids-explore">Take a look around <span aria-hidden="true">↓</span></a>
            <p className="kids-hero-motto">Help Today. Pay It Forward Tomorrow.</p>
          </div>
          <div className="kids-hero-art" data-testid="illustration-kids-hero">
            <div className="hero-art-note note-one">made for curious minds</div>
            <KiteIllustration />
            <div className="hero-art-note note-two">kindness has no borders</div>
            <span className="hero-art-index" aria-hidden="true">01 / 03</span>
          </div>
        </section>

        <div className="kids-ribbon" aria-label="Niakofa Kids values" data-testid="kids-values-ribbon">
          <span>Curiosity</span><i aria-hidden="true" /><span>Kindness</span><i aria-hidden="true" /><span>Imagination</span><i aria-hidden="true" /><span>Community</span>
        </div>

        <section className="kids-intro kids-section" id="our-world" aria-labelledby="world-title" data-testid="section-kids-world">
          <div className="kids-intro-art"><CommunityIllustration /></div>
          <div className="kids-intro-copy">
            <p className="kids-eyebrow">The world is our neighborhood</p>
            <h2 id="world-title">Growing up<br />with <em>goodwill.</em></h2>
            <p>Niakofa Kids is the family destination within Niakofa: an invitation to explore a more connected world, where helping one another is something we learn, talk about and carry with us.</p>
            <p>We believe the biggest ideas can begin with a small question, a shared story, or simply noticing what someone else might need.</p>
            <div className="kids-side-note"><SparkMark className="side-note-star" /><span>Help today.<br /><strong>Pass it on tomorrow.</strong></span></div>
          </div>
        </section>

        <section className="kids-feature" aria-labelledby="featured-title" data-testid="section-kids-feature">
          <div className="feature-topline"><span>ON THE HORIZON</span><span>NI AKOFA KIDS PROJECT 01</span></div>
          <div className="feature-content">
            <div className="feature-copy">
              <p className="kids-eyebrow">A project in the making</p>
              <h2 id="featured-title">War for<br /><em>Mars</em></h2>
              <p>Meet a Niakofa Kids game project with a big name and a story still unfolding. We’ll share more when the details are ready to be shared.</p>
              <a className="feature-link" href="/kids/wfm" data-testid="link-kids-feature-war-for-mars">Discover what’s known <span aria-hidden="true">↗</span></a>
            </div>
            <div className="feature-art" aria-hidden="true">
              <div className="feature-orbit orbit-a" /><div className="feature-orbit orbit-b" />
              <div className="feature-planet"><span className="planet-crater crater-a" /><span className="planet-crater crater-b" /><span className="planet-crater crater-c" /></div>
              <SparkMark className="feature-star star-a" /><SparkMark className="feature-star star-b" />
              <span className="feature-caption">A Niakofa Kids game project</span>
            </div>
          </div>
          <div className="feature-bottomline"><span>DETAILED GAMEPLAY AND AGE GUIDANCE NOT YET PUBLISHED</span><span>NO VERIFIED PUBLIC RELEASE</span></div>
        </section>

        <section className="kids-grownups kids-section" id="for-grownups" aria-labelledby="grownups-title" data-testid="section-kids-grownups">
          <div className="grownups-heading">
            <p className="kids-eyebrow">A note for the people looking out for them</p>
            <h2 id="grownups-title">For the <em>grown-ups.</em></h2>
            <p>We want families to have clear information, not guesswork. Here’s what this destination does and does not do today.</p>
          </div>
          <div className="grownups-list">
            <article className="grownup-point">
              <span className="grownup-number">01</span>
              <div><h3>This page is just a page.</h3><p>This page itself does not ask children to sign in, submit personal information, or chat.</p></div>
              <span className="grownup-mark" aria-hidden="true">+</span>
            </article>
            <article className="grownup-point">
              <span className="grownup-number">02</span>
              <div><h3>Details matter before release.</h3><p>Parents should review confirmed age, safety and privacy details before any eventual release.</p></div>
              <span className="grownup-mark" aria-hidden="true">+</span>
            </article>
            <article className="grownup-point">
              <span className="grownup-number">03</span>
              <div><h3>No multiplayer claims.</h3><p>Multiplayer is not verified or advertised for War for Mars.</p></div>
              <span className="grownup-mark" aria-hidden="true">+</span>
            </article>
          </div>
        </section>

        <section className="kids-closing" aria-labelledby="closing-title" data-testid="section-kids-closing">
          <OrbitMark className="closing-orbit" />
          <p className="kids-eyebrow">A world made better, together</p>
          <h2 id="closing-title">The kindest thing<br />can be <em>contagious.</em></h2>
          <p>Keep exploring the Niakofa Kids corner, and follow the story of War for Mars as more is confirmed.</p>
          <a className="kids-pill-link kids-pill-link-dark" href="/kids/wfm" data-testid="link-kids-closing-war-for-mars">Explore War for Mars <span aria-hidden="true">↗</span></a>
        </section>
      </main>
      <KidsFooter />
    </div>
  );
}

function MarsIllustration() {
  return (
    <svg className="mars-illustration" viewBox="0 0 720 520" role="img" aria-labelledby="mars-title mars-desc">
      <title id="mars-title">War for Mars project artwork</title>
      <desc id="mars-desc">An imagined red planet hangs in a midnight sky, surrounded by an orbit and small stars. This is illustrative artwork, not a depiction of published gameplay.</desc>
      <circle cx="360" cy="260" r="181" fill="#15344F" />
      <circle cx="360" cy="260" r="135" fill="#FF775E" />
      <path d="M236 223c39-38 80-57 126-57 48 0 92 21 132 62-39 24-82 36-129 36-49 0-92-14-129-41Z" fill="#FF9D81" />
      <path d="M263 305c35-24 69-36 102-36 40 0 77 15 111 44-30 38-68 57-114 57-44 0-78-22-99-65Z" fill="#D95049" />
      <path d="M249 257c40 23 80 35 122 35 53 0 104-17 153-50" fill="none" stroke="#B93C3F" strokeWidth="13" strokeLinecap="round" opacity=".6" />
      <ellipse cx="362" cy="257" rx="292" ry="102" fill="none" stroke="#00CFFF" strokeWidth="2" transform="rotate(-18 362 257)" opacity=".82" />
      <circle cx="90" cy="344" r="11" fill="#FFC94A" stroke="#08182B" strokeWidth="4" />
      <circle cx="133" cy="111" r="4" fill="#F7F0DB" /><circle cx="571" cy="103" r="5" fill="#00CFFF" />
      <circle cx="610" cy="359" r="4" fill="#FFC94A" /><circle cx="184" cy="422" r="3" fill="#FF775E" />
      <path d="m522 179 6 14 14 6-14 6-6 14-6-14-14-6 14-6 6-14Zm-373 29 4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Z" fill="#F7F0DB" />
      <path d="M49 374h36m520-177h43M177 82h21" stroke="#00CFFF" strokeWidth="2" strokeLinecap="round" opacity=".65" />
    </svg>
  );
}

export function WarForMarsLandingPage() {
  return (
    <div className="kids-site mars-page">
      <a className="kids-skip-link" href="#mars-main" data-testid="link-mars-skip-main">Skip to content</a>
      <KidsHeader projectPage />
      <main id="mars-main">
        <section className="mars-hero" aria-labelledby="mars-heading" data-testid="section-mars-hero">
          <div className="mars-hero-text">
            <a className="mars-back-link" href="/kids/" data-testid="link-mars-back-kids"><span aria-hidden="true">←</span> Niakofa Kids</a>
            <p className="kids-eyebrow"><span className="eyebrow-dot" /> A Niakofa Kids game project</p>
            <h1 id="mars-heading">War for<br /><em>Mars.</em></h1>
            <p className="mars-lede">A project in the making. Here’s what we can confirm today—and what we can’t yet tell you.</p>
            <div className="mars-status" data-testid="status-mars-release">
              <span className="status-indicator" aria-hidden="true" />
              <span><strong>No verified public release</strong><small>There is no confirmed public version available at this time.</small></span>
            </div>
          </div>
          <div className="mars-hero-art" data-testid="illustration-mars">
            <MarsIllustration />
            <p className="mars-art-caption">An imagined world, not published gameplay.</p>
          </div>
          <div className="mars-hero-index" aria-hidden="true">PROJECT FILE / 01</div>
        </section>

        <section className="mars-platforms" aria-labelledby="platforms-title" data-testid="section-mars-platform-availability">
          <div>
            <p className="kids-eyebrow">Availability</p>
            <h2 id="platforms-title">Where to play?</h2>
          </div>
          <ul aria-label="War for Mars platform release status">
            <li data-testid="status-mars-web"><span>Web</span><strong>No verified release</strong></li>
            <li data-testid="status-mars-ios"><span>iOS</span><strong>No verified release</strong></li>
            <li data-testid="status-mars-android"><span>Android</span><strong>No verified release</strong></li>
          </ul>
        </section>

        <section className="mars-known" aria-labelledby="known-title" data-testid="section-mars-known">
          <div className="mars-known-intro">
            <p className="kids-eyebrow">A clear picture, so far</p>
            <h2 id="known-title">What we <em>know.</em></h2>
            <p>We’d rather be specific about the few confirmed details than fill in the blanks.</p>
          </div>
          <div className="known-card">
            <div className="known-card-symbol" aria-hidden="true"><OrbitMark /></div>
            <div><span className="known-label">CONFIRMED</span><h3>It’s a Niakofa Kids game project.</h3><p>War for Mars is a project within the Niakofa Kids family destination. Further public details have not yet been published.</p></div>
          </div>
          <div className="known-footnote"><span className="known-footnote-mark" aria-hidden="true">i</span><span>That’s the confirmed picture for now. We’ll keep this page grounded in information that’s been verified.</span></div>
        </section>

        <section className="mars-unpublished" aria-labelledby="unpublished-title" data-testid="section-mars-unpublished">
          <div className="unpublished-heading">
            <p className="kids-eyebrow">No guessing games</p>
            <h2 id="unpublished-title">What’s not<br /><em>published yet.</em></h2>
          </div>
          <div className="unpublished-content">
            <p>Detailed gameplay and age guidance have not yet been published. We also can’t confirm a public release, where it might be available, or whether multiplayer is part of the project.</p>
            <p>So this page has no play, download, or store links—and we won’t present unconfirmed features as facts.</p>
            <div className="unpublished-stamp">NOT<br />YET<br /><span>CONFIRMED</span></div>
          </div>
        </section>

        <section className="mars-parents" aria-labelledby="parents-title" data-testid="section-mars-parents">
          <div className="parents-top">
            <span className="parents-index">A NOTE FOR FAMILIES</span>
            <span className="parents-rule" />
          </div>
          <div className="parents-body">
            <div className="parents-headline"><p className="kids-eyebrow">Parents &amp; caregivers</p><h2 id="parents-title">Clarity comes<br />before <em>curiosity.</em></h2></div>
            <div className="parents-details">
              <p>This page itself does not ask children to sign in, submit personal information, or chat.</p>
              <p>Before any eventual release, parents should review confirmed age, safety and privacy details. Those details have not yet been published here.</p>
              <p>Multiplayer is not verified or advertised. We do not claim that the game is safe for every age or that it meets any particular legal standard.</p>
            </div>
          </div>
          <div className="parents-bottom"><span>INFORMATION STATUS</span><strong>Early project details only</strong><span>CHECK BACK WHEN MORE IS VERIFIED</span></div>
        </section>

        <section className="mars-return" aria-labelledby="return-title" data-testid="section-mars-return">
          <SparkMark className="return-star" />
          <p className="kids-eyebrow">The bigger picture</p>
          <h2 id="return-title">One little project<br />in a <em>big-hearted</em> world.</h2>
          <p>Niakofa Kids is about the things that connect us: curiosity, imagination and the everyday ways we show up for one another.</p>
          <a className="kids-pill-link kids-pill-link-dark" href="/kids/" data-testid="link-mars-return-kids">Back to Niakofa Kids <span aria-hidden="true">↗</span></a>
        </section>
      </main>
      <KidsFooter />
    </div>
  );
}
