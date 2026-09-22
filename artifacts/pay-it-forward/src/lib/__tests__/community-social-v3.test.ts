import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Community Social V4 architecture", () => {
  const shell = fs.readFileSync(
    path.join(__dirname, "../../components/community/CommunitySocialShell.tsx"),
    "utf8",
  );
  const shellCss = fs.readFileSync(
    path.join(__dirname, "../../components/community/community-social-v4.css"),
    "utf8",
  );
  const app = fs.readFileSync(path.join(__dirname, "../../App.tsx"), "utf8");

  test("primary Community navigation is icon-first and limited to six destinations", () => {
    assert.match(shellCss, /grid-template-columns: repeat\(6/);
    assert.equal((shell.match(/key: "/g) || []).length >= 6, true);
    assert.match(shell, /aria-label=\{item\.label\}/);
    assert.match(shell, /icon: BookOpen/);
    assert.match(shell, /icon: Users\b/);
    assert.match(shell, /icon: Globe2/);
    assert.match(shell, /icon: Bell/);
    assert.match(shell, /icon: UserRound/);
  });

  test("there is no persistent Feed/Requests/More text-tab bar", () => {
    assert.doesNotMatch(shell, /contentNavItems/);
    assert.doesNotMatch(shell, /label: "Feed"/);
    assert.doesNotMatch(shell, /\{item\.label\}\s*<\/button>/);
    assert.doesNotMatch(shell, /More Community destinations/);
  });

  test("secondary Niakofa systems are moved into a menu", () => {
    assert.match(shell, /menuItems/);
    assert.match(shell, /\/community\/requests/);
    assert.match(shell, /\/community\/services/);
    assert.match(shell, /\/community\/circles/);
    assert.match(shell, /\/community\/media/);
    assert.match(shell, /\/diaspora/);
    assert.doesNotMatch(shell, /href: "\/profile"/);
  });

  test("the unified Create surface includes gratitude", () => {
    assert.match(fs.readFileSync(path.join(__dirname, "../../pages/community.tsx"), "utf8"), /Share Gratitude|Gratitude/);
    assert.match(fs.readFileSync(path.join(__dirname, "../../components/community/CommunityGratitudeComposer.tsx"), "utf8"), /POST.*api\/gratitude|\/api\/gratitude/);
  });

  test("the no-Hub state offers a path into Diaspora", () => {
    const home = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityHomeView.tsx"), "utf8");
    assert.match(home, /href="\/diaspora"/);
    assert.match(home, /Explore Diaspora/);
  });

  test("Community owns its social chrome instead of duplicating global navigation", () => {
    assert.match(app, /isCommunitySurface/);
    assert.match(app, /isCommunityHome/);
    assert.match(app, /isMessages \|\| isDiasporaMessages \|\| isCommunitySurface \|\| isCommunityHome/);
  });

  test("Community menu supports keyboard dismissal and focus containment", () => {
    assert.match(shell, /event\.key === "Escape"/);
    assert.match(shell, /event\.key !== "Tab"/);
    assert.match(shell, /menuCloseRef\.current\?\.focus/);
    assert.match(shell, /restoreTarget\?\.focus/);
  });
});