const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const members = {
  "kwame-mensah": { name: "Kwame Mensah", meta: "GREAT GRANDFATHER · 1884—1917", role: "Merchant · Gold Coast", stories: 12, photos: 4, letters: 3, signal: "4 memories ready to discover", character: "kwame", status: "ancestor" },
  "ama-mensah": { name: "Ama Mensah", meta: "FAMILY STORYTELLER · PRESENT", role: "Oral historian · Cape Coast", stories: 8, photos: 11, letters: 1, signal: "2 fresh recordings this week", character: "ama", status: "living" },
  "unknown-branch": { name: "A branch waiting to grow", meta: "UNIDENTIFIED RELATIVE · UNKNOWN", role: "A story is looking for its person", stories: 0, photos: 1, letters: 0, signal: "Add a memory to illuminate this branch", character: "kwame", status: "unknown" },
  "memory-branch": { name: "The market road", meta: "NEW LANDMARK · 1890", role: "A place remembered by Ama", stories: 1, photos: 0, letters: 0, signal: "World regeneration available", character: "kwame", status: "new" }
};

const state = {
  selected: "kwame-mensah",
  view: "legacy",
  zoom: 1,
  player: { x: 48, y: 67 },
  weather: false,
  regenerated: false,
  echos: JSON.parse(localStorage.getItem("niakofa-echoes") || "[]")
};

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3000);
}

function setView(view) {
  state.view = view;
  const menu = $("#main-menu");
  const world = $("#world-screen");
  if (view === "world") {
    menu.classList.add("is-hidden");
    world.classList.remove("is-hidden");
    $("#game-stage").focus({ preventScroll: true });
  } else {
    menu.classList.remove("is-hidden");
    world.classList.add("is-hidden");
    $$(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
    $("[data-panel=legacy]").classList.toggle("is-hidden", view !== "legacy");
    $("[data-panel=journal]").classList.toggle("is-hidden", view !== "journal");
    renderJournal();
  }
}

function setCharacter(character = "kwame") {
  const source = character === "ama" ? "ama" : "kwame";
  const portrait = $(".portrait-character");
  portrait.dataset.character = source;
  $$(".portrait-character .layer").forEach((layer) => {
    const suffix = layer.className.split(" ").find((name) => ["body", "clothing", "rear-hair", "front-hair"].includes(name));
    const file = suffix === "rear-hair" ? "rear-hair" : suffix === "front-hair" ? "front-hair" : suffix;
    layer.src = `/assets/characters/${source}-${file}.png`;
  });
}

function selectMember(id) {
  const member = members[id] || members["kwame-mensah"];
  state.selected = id;
  $("#profile-meta").textContent = member.meta;
  $("#profile-name").textContent = member.name;
  $("#profile-role").textContent = member.role;
  $("#profile-stories").textContent = member.stories;
  $("#profile-photos").textContent = member.photos;
  $("#profile-letters").textContent = member.letters;
  $("#profile-signal").textContent = member.signal;
  setCharacter(member.character);
  $$(".tree-node").forEach((node) => node.classList.toggle("is-selected", node.dataset.member === id));
  $("#tree-caption-text").textContent = id === "kwame-mensah" ? "Your family tree is growing" : member.signal;
}

function renderJournal() {
  const journal = $("#journal-grid");
  const cards = [
    { mark: "◒", title: "A song for the river", body: "“He sang to the river before every market day.”", meta: "AMA MENSAH · ORAL HISTORY", newCard: false },
    { mark: "⌂", title: "The old trading post", body: "A place where the Mensah family traded cocoa, cloth, and stories.", meta: "WORLD LANDMARK · 1890", newCard: false },
    { mark: "✦", title: "The market road", body: "A new path appeared after Ama remembered Kwame’s weekly journey.", meta: "WORLD REGENERATION · VERSION 02", newCard: true },
    ...state.echos.map((echo) => ({ mark: "✎", title: "New family memory", body: `“${echo}”`, meta: "YOUR CONTRIBUTION · JUST NOW", newCard: true }))
  ];
  journal.innerHTML = cards.map((card) => `<article class="memory-card${card.newCard ? " is-new" : ""}"><div class="memory-mark">${card.mark}</div><h3>${card.title}</h3><p>${card.body}</p><small>${card.meta}</small></article>`).join("");
  $("#journal-count").textContent = String(2 + state.echos.length);
}

function openEcho() {
  const modal = $("#echo-modal");
  modal.classList.remove("is-hidden");
  $("#echo-input").focus();
}

function closeEcho() {
  $("#echo-modal").classList.add("is-hidden");
  $("#echo-input").value = "";
}

function saveEcho(text) {
  state.echos.unshift(text.trim());
  localStorage.setItem("niakofa-echoes", JSON.stringify(state.echos.slice(0, 8)));
  closeEcho();
  renderJournal();
  $("#world-status").textContent = "World listening";
  $("#tree-caption-text").textContent = "A new branch is taking root";
  showToast("Memory echo added · the world is listening");
}

function regenerateWorld() {
  if (state.regenerated) {
    showToast("The world is already carrying this memory");
    return;
  }
  state.regenerated = true;
  $("#quest-status").textContent = "DISCOVERY COMPLETE";
  $("#quest-title").textContent = "The Trading House";
  $("#quest-description").textContent = "A new landmark and a new voice now belong to the Mensah market road.";
  $("#knowledge-value").textContent = "82%";
  $("#knowledge-bar").style.width = "82%";
  $("#quest-objective").innerHTML = '<span class="objective-check done">✓</span><span>Listen to Ama’s memory</span>';
  $("#quest-object").classList.add("is-hidden");
  $("#world-status").textContent = "World regenerated";
  showToast("World regenerated · new landmark discovered");
}

function movePlayer(dx, dy) {
  if (state.view !== "world") return;
  state.player.x = Math.max(8, Math.min(92, state.player.x + dx));
  state.player.y = Math.max(12, Math.min(88, state.player.y + dy));
  const player = $("#player-character");
  player.style.setProperty("--x", `${state.player.x}%`);
  player.style.setProperty("--y", `${state.player.y}%`);
  const nearAma = Math.abs(state.player.x - 72) < 9 && Math.abs(state.player.y - 51) < 10;
  const nearStory = Math.abs(state.player.x - 42) < 9 && Math.abs(state.player.y - 38) < 10;
  $("#interaction-hint").classList.toggle("is-hidden", !(nearAma || nearStory));
  $("#interaction-hint").dataset.target = nearAma ? "ama" : nearStory ? "story" : "";
}

function interact() {
  const hint = $("#interaction-hint");
  if (hint.classList.contains("is-hidden")) {
    showToast("Walk closer to a person or story fragment");
    return;
  }
  if (hint.dataset.target === "ama") {
    $("#echo-quote").textContent = "“He sang to the river before every market day.”";
    $("#quest-objective").innerHTML = '<span class="objective-check done">✓</span><span>Listen to Ama’s memory</span>';
    $("#knowledge-value").textContent = "72%";
    $("#knowledge-bar").style.width = "72%";
    showToast("Memory echo heard · knowledge updated");
  } else {
    regenerateWorld();
  }
}

$$(".tab").forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));
$$(".tree-node").forEach((node) => {
  node.addEventListener("click", () => selectMember(node.dataset.member));
  node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectMember(node.dataset.member); } });
});
$("#play-life").addEventListener("click", () => setView("world"));
$("#back-to-tree").addEventListener("click", () => setView("legacy"));
$("#open-journal").addEventListener("click", () => setView("journal"));
$("#world-journal").addEventListener("click", () => { setView("journal"); });
$("#record-echo-journal").addEventListener("click", openEcho);
$("#view-memories").addEventListener("click", () => setView("journal"));
$("#regenerate-world").addEventListener("click", regenerateWorld);
$("#close-echo").addEventListener("click", closeEcho);
$("#cancel-echo").addEventListener("click", closeEcho);
$("#echo-form").addEventListener("submit", (event) => { event.preventDefault(); saveEcho($("#echo-input").value); });
$("#sound-toggle").addEventListener("click", (event) => {
  const active = event.currentTarget.getAttribute("aria-pressed") === "true";
  event.currentTarget.setAttribute("aria-pressed", String(!active));
  showToast(active ? "Ambient sound muted" : "Ambient sound ready");
});
$("#weather-toggle").addEventListener("click", () => {
  state.weather = !state.weather;
  $("#rain-layer").classList.toggle("is-hidden", !state.weather);
  $("#weather-toggle").textContent = state.weather ? "☂" : "☼";
  showToast(state.weather ? "Rain moves through the memory" : "The sky is clear");
});
$("#zoom-in").addEventListener("click", () => { state.zoom = Math.min(1.2, state.zoom + .1); $("#baobab").style.transform = `scale(${state.zoom})`; $("#tree-zoom-label").textContent = `${Math.round(state.zoom * 100)}%`; });
$("#zoom-out").addEventListener("click", () => { state.zoom = Math.max(.8, state.zoom - .1); $("#baobab").style.transform = `scale(${state.zoom})`; $("#tree-zoom-label").textContent = `${Math.round(state.zoom * 100)}%`; });
$("#game-stage").addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const moves = { arrowup: [0, -3], w: [0, -3], arrowdown: [0, 3], s: [0, 3], arrowleft: [-3, 0], a: [-3, 0], arrowright: [3, 0], d: [3, 0] };
  if (moves[key]) { event.preventDefault(); movePlayer(...moves[key]); }
  if (key === " " || key === "enter") { event.preventDefault(); interact(); }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#echo-modal").classList.contains("is-hidden")) closeEcho();
});

selectMember(state.selected);
renderJournal();