import "./_group.css";
import { useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  BadgeCheck,
  BookOpen,
  Check,
  Clapperboard,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  Globe2,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  MapPin,
  MoreHorizontal,
  Radio,
  ShoppingBag,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

type ProfileTab = "overview" | "spaces" | "history" | "settings";
type MomentView = "published" | "archive" | "featured";
type SpaceKey = "family" | "moments" | "spirals" | "hubs" | "exchange" | "messages";
type ControlKey = "family" | "moments" | "exchange" | "spirals" | "hubs";

const profileSpaces: Array<{
  key: SpaceKey;
  title: string;
  kind: string;
  audience: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}> = [
  {
    key: "family",
    title: "Family Stories & Vault",
    kind: "Private archive",
    audience: "Only you or your Family Space",
    description: "Keep written stories, photographs, recordings, and memories with your family.",
    icon: BookOpen,
    accent: "text-[#f1c89f] bg-[#f1c89f]/[.11]",
  },
  {
    key: "moments",
    title: "Sparks · Moments",
    kind: "Community feed",
    audience: "Your Community or a chosen Hub",
    description: "Short shared updates live in Moments; each Spark keeps its chosen audience.",
    icon: Clapperboard,
    accent: "text-[#75dcef] bg-[#00cfff]/[.11]",
  },
  {
    key: "spirals",
    title: "Spirals",
    kind: "Live conversations",
    audience: "Curated city or neighborhood",
    description: "Join or host a live audio conversation, with video available in some rooms.",
    icon: Radio,
    accent: "text-[#a6e2c3] bg-[#a6e2c3]/[.11]",
  },
  {
    key: "hubs",
    title: "Diaspora Hubs",
    kind: "Shared communities",
    audience: "Hub-specific scope",
    description: "Find cultural and regional communities, published stories, and local connections.",
    icon: Globe2,
    accent: "text-[#eab0b3] bg-[#eab0b3]/[.11]",
  },
  {
    key: "exchange",
    title: "Niakofa Exchange",
    kind: "Neighbor-to-neighbor",
    audience: "A coarse local area",
    description: "Offer a free item or skill, ask for help, and coordinate a safe handoff.",
    icon: ShoppingBag,
    accent: "text-[#f0cf7a] bg-[#f0cf7a]/[.11]",
  },
  {
    key: "messages",
    title: "Messages & alerts",
    kind: "Direct communication",
    audience: "People in the conversation",
    description: "Continue a private exchange handoff, reply to a neighbor, or review notifications.",
    icon: MessageCircle,
    accent: "text-[#a7dce4] bg-[#a7dce4]/[.11]",
  },
];

const controlOrder: ControlKey[] = ["family", "moments", "exchange", "spirals", "hubs"];
const mediaGuides: Record<ControlKey, {
  title: string;
  status: string;
  summary: string;
  points: string[];
}> = {
  family: {
    title: "Family stories & memories",
    status: "Edit and delete, by permission",
    summary: "Family content stays in its own archive; it is not a Community Moment.",
    points: [
      "A Story’s edit and delete controls appear only when the Family Space grants you manage access.",
      "The author of a Memory can edit its title and story text, add media, or delete the whole Memory.",
      "A Story can link to a Vault recording or photo; removing that link does not remove the original Memory.",
    ],
  },
  moments: {
    title: "Sparks · Community Moments",
    status: "Delete from any owner view",
    summary: "The current creator surface does not offer editing for a published Moment.",
    points: [
      "You can archive a published Moment for private retention, feature or unfeature it, and toggle whether video responses are allowed.",
      "You can request deletion of your own Moment directly from Published, Archive, or Featured; archiving first is optional.",
      "Niakofa confirms deletion only after stored media cleanup and Moment removal. If processing or cleanup fails, the Moment remains for retry.",
    ],
  },
  exchange: {
    title: "Exchange posts & video Sparks",
    status: "Edit or withdraw before handoff",
    summary: "Exchange posts are offers and needs, not a shared social-media feed.",
    points: [
      "An active post can be edited before pickup coordination is accepted; it can be withdrawn while still active.",
      "An archived post can be renewed. A permanent delete action is not surfaced in the reviewed Exchange UI.",
      "Exchange video Sparks are attached to a listing; captions are editable while the Spark is a draft.",
    ],
  },
  spirals: {
    title: "Spirals",
    status: "Live room controls",
    summary: "A Spiral is a live conversation, not a persistent profile post.",
    points: [
      "Hosts set the session title, topic, format, speaker limit, and whether recording is allowed when they start a room.",
      "Recordings live in the Spiral room’s recording area; no profile-level media edit or delete control is surfaced.",
    ],
  },
  hubs: {
    title: "Diaspora Hubs & stories",
    status: "Hub-specific publishing",
    summary: "Hub stories have their own audience and are not part of the private Family Vault.",
    points: [
      "The Hub story view supports browsing, reporting, and translation review; it does not surface an owner edit or delete control.",
      "Recording an oral history from a Hub context leads into Family, where its audience and archive are managed.",
    ],
  },
};

type Moment = {
  id: number;
  title: string;
  caption: string;
  date: string;
  visual: "garden" | "pantry" | "walk" | "archive";
  featured: boolean;
  archived: boolean;
  responsesEnabled: boolean;
};

const initialMoments: Moment[] = [
  {
    id: 1,
    title: "A slow Saturday at the garden",
    caption: "We got the new beds ready before the heat came in. There's room for a few more hands next weekend.",
    date: "Jun 14",
    visual: "garden",
    featured: true,
    archived: true,
    responsesEnabled: true,
  },
  {
    id: 2,
    title: "The little pantry, restocked",
    caption: "A few neighbors brought what they could, and the shelves are full again. Take what you need, leave what you can.",
    date: "Jun 11",
    visual: "pantry",
    featured: false,
    archived: false,
    responsesEnabled: true,
  },
  {
    id: 3,
    title: "A good walk, shared",
    caption: "We found a shady route by the community center. A gentle reminder that showing up can be simple.",
    date: "Jun 06",
    visual: "walk",
    featured: false,
    archived: false,
    responsesEnabled: false,
  },
  {
    id: 4,
    title: "Garden morning, saved",
    caption: "Keeping this Community Moment in my private archive.",
    date: "May 29",
    visual: "archive",
    featured: false,
    archived: true,
    responsesEnabled: false,
  },
];

const visualStyles: Record<Moment["visual"], string> = {
  garden: "from-[#204b43] via-[#45745d] to-[#d9a95f]",
  pantry: "from-[#243c54] via-[#477b83] to-[#d49a58]",
  walk: "from-[#413e55] via-[#7f7183] to-[#d4a46b]",
  archive: "from-[#354d58] via-[#678276] to-[#c39b5a]",
};

function MomentArtwork({ kind }: { kind: Moment["visual"] }) {
  return (
    <div
      className={`relative isolate flex h-[118px] items-end overflow-hidden rounded-[1.15rem] bg-gradient-to-br ${visualStyles[kind]}`}
      aria-hidden="true"
    >
      <div className="absolute -right-5 -top-8 h-32 w-32 rounded-full border border-white/20" />
      <div className="absolute right-4 top-5 h-16 w-16 rounded-full bg-[#f7d58a]/80 shadow-[0_0_34px_rgba(247,213,138,.32)]" />
      {kind === "garden" && (
        <>
          <div className="absolute bottom-0 left-[12%] h-[56%] w-[18%] -rotate-6 rounded-t-full bg-[#203a34]/85" />
          <div className="absolute bottom-0 left-[35%] h-[72%] w-[18%] rotate-3 rounded-t-full bg-[#294d42]/90" />
          <div className="absolute bottom-0 left-[59%] h-[48%] w-[20%] -rotate-3 rounded-t-full bg-[#315748]/90" />
          <div className="absolute bottom-0 h-5 w-full bg-[#273a32]/80" />
        </>
      )}
      {kind === "pantry" && (
        <>
          <div className="absolute bottom-4 left-[12%] h-[66%] w-[72%] rounded-t-xl border-2 border-[#e2d0a4]/80 bg-[#425b55]/65" />
          <div className="absolute bottom-[35%] left-[14%] h-1 w-[68%] bg-[#e2d0a4]/80" />
          <div className="absolute bottom-[19%] left-[14%] h-1 w-[68%] bg-[#e2d0a4]/80" />
          <div className="absolute bottom-[37%] left-[24%] h-7 w-5 rounded-sm bg-[#e5b66c]" />
          <div className="absolute bottom-[21%] left-[51%] h-7 w-6 rounded-sm bg-[#d68869]" />
          <div className="absolute bottom-[37%] left-[66%] h-6 w-5 rounded-sm bg-[#b5c48a]" />
        </>
      )}
      {kind === "walk" && (
        <>
          <div className="absolute bottom-0 left-[41%] h-[60%] w-[18%] -skew-x-12 bg-[#d7c096]/85" />
          <div className="absolute bottom-0 left-[9%] h-[47%] w-[24%] rounded-t-full bg-[#344b44]/80" />
          <div className="absolute bottom-0 right-[7%] h-[55%] w-[23%] rounded-t-full bg-[#384f48]/85" />
          <div className="absolute bottom-5 left-[48%] h-5 w-3 rounded-full bg-[#f2d8b0]" />
        </>
      )}
      {kind === "archive" && (
        <>
          <div className="absolute bottom-0 left-[15%] h-[48%] w-[72%] rounded-t-2xl bg-[#29433c]/90" />
          <div className="absolute bottom-[35%] left-[28%] h-12 w-12 rounded-full border-[5px] border-[#d7b86f]/80" />
          <div className="absolute bottom-0 left-[48%] h-[38%] w-[17%] rounded-t-full bg-[#728b70]" />
        </>
      )}
      <span className="relative z-10 mb-3 ml-3 rounded-full border border-white/25 bg-[#08182b]/45 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.15em] text-white/90 backdrop-blur-sm">
        Community moment
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[.18em] text-[#75dcef]">{children}</p>;
}

function MomentCard({
  moment,
  view,
  menuOpen,
  deleteConfirm,
  onMenu,
  onArchive,
  onFeature,
  onResponses,
  onDeletePrompt,
  onDelete,
  onCancelDelete,
}: {
  moment: Moment;
  view: MomentView;
  menuOpen: boolean;
  deleteConfirm: boolean;
  onMenu: () => void;
  onArchive: () => void;
  onFeature: () => void;
  onResponses: () => void;
  onDeletePrompt: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-[1.35rem] border border-white/[.09] bg-[#0d2237] shadow-[0_14px_34px_rgba(0,0,0,.14)]">
      <div className="relative p-3 pb-0">
        <MomentArtwork kind={moment.visual} />
        {moment.featured && (
          <span className="absolute left-6 top-6 inline-flex items-center gap-1 rounded-full border border-[#f0c76f]/35 bg-[#17283a]/85 px-2.5 py-1 text-[10px] font-bold text-[#f4d58b] backdrop-blur">
            <Star className="h-3 w-3 fill-current" /> Featured
          </span>
        )}
        {view === "archive" && (
          <span className="absolute right-6 top-6 inline-flex items-center gap-1 rounded-full border border-white/20 bg-[#08182b]/80 px-2.5 py-1 text-[10px] font-bold text-white/90 backdrop-blur">
            <LockKeyhole className="h-3 w-3" /> Only you
          </span>
        )}
      </div>
      <div className="p-4 pt-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#00cfff]/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[#75dcef]">
                <Users className="h-3 w-3" /> Community
              </span>
              <span className="text-[10px] font-medium text-[#8ea6c0]">{moment.date}</span>
            </div>
            <h3 className="font-['Fraunces'] text-[19px] font-semibold leading-tight tracking-[-.025em] text-[#f8f7ed]">{moment.title}</h3>
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={onMenu}
              aria-label={`More options for ${moment.title}`}
              aria-expanded={menuOpen}
              className="grid h-10 w-10 place-items-center rounded-full text-[#9eb1c2] transition hover:bg-white/[.07] hover:text-white"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-20 w-48 rounded-2xl border border-white/10 bg-[#132a42] p-1.5 shadow-xl">
                {view !== "archive" && (
                  <button type="button" onClick={onArchive} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-[#dce8ee] hover:bg-white/[.07]">
                    <Archive className="h-4 w-4 text-[#75dcef]" /> Save to private archive
                  </button>
                )}
                <button type="button" onClick={onFeature} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-[#dce8ee] hover:bg-white/[.07]">
                  <Star className={`h-4 w-4 ${moment.featured ? "fill-current text-[#f4d58b]" : "text-[#f4d58b]"}`} />
                  {moment.featured ? "Remove from featured" : "Feature on profile"}
                </button>
                {!deleteConfirm && (
                  <button type="button" onClick={onDeletePrompt} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-[#ff9d8d] hover:bg-[#ff5a5f]/10">
                    <Trash2 className="h-4 w-4" /> Delete Moment
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="text-[13px] leading-[1.55] text-[#b7c5d1]">{moment.caption}</p>

        {deleteConfirm ? (
          <div className="mt-4 rounded-2xl border border-[#ff8c81]/35 bg-[#ff5a5f]/[.07] p-3.5" role="group" aria-label={`Confirm deletion of ${moment.title}`}>
            <div className="flex items-start gap-2.5">
              <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-[#ff9d8d]" />
              <div>
                <p className="text-xs font-extrabold text-[#fff2ed]">Delete this Moment?</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#c4b5b7]">This removes the Moment from its audience and deletes its stored media. Niakofa confirms removal only after cleanup; if cleanup is blocked or fails, the Moment stays for retry. This can’t be undone.</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onDelete} className="min-h-10 rounded-xl bg-[#ff7b70] px-3 text-[11px] font-extrabold text-[#241714]">Delete Moment</button>
              <button type="button" onClick={onCancelDelete} className="min-h-10 rounded-xl border border-white/15 px-3 text-[11px] font-bold text-[#e2eaf0] hover:bg-white/[.06]">Keep Moment</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[.08] pt-3">
            <button
              type="button"
              onClick={onResponses}
              aria-pressed={moment.responsesEnabled}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-[11px] font-bold transition ${
                moment.responsesEnabled
                  ? "border-[#00cfff]/25 bg-[#00cfff]/[.08] text-[#8ceaff]"
                  : "border-white/[.12] text-[#9eafbd] hover:bg-white/[.05]"
              }`}
            >
              <HeartHandshake className="h-3.5 w-3.5" />
              Responses {moment.responsesEnabled ? "on" : "off"}
              <span className={`ml-0.5 h-1.5 w-1.5 rounded-full ${moment.responsesEnabled ? "bg-[#00cfff]" : "bg-[#718398]"}`} />
            </button>
            {moment.archived && view !== "archive" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#9eb1c2]">
                <LockKeyhole className="h-3 w-3" /> In your archive
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function ActivityProfile() {
  const [tab, setTab] = useState<ProfileTab>(() =>
    new URLSearchParams(window.location.search).get("tab") === "spaces" ? "spaces" : "overview"
  );
  const [momentView, setMomentView] = useState<MomentView>("published");
  const [selectedSpace, setSelectedSpace] = useState<SpaceKey>("family");
  const [controlView, setControlView] = useState<ControlKey>("moments");
  const [moments, setMoments] = useState(initialMoments);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [showSettingsNote, setShowSettingsNote] = useState(true);
  const [darkModeOn, setDarkModeOn] = useState(true);
  const activeSpace = profileSpaces.find((space) => space.key === selectedSpace)!;
  const activeGuide = mediaGuides[controlView];

  const visibleMoments = useMemo(() => {
    if (momentView === "archive") return moments.filter((moment) => moment.archived);
    if (momentView === "featured") return moments.filter((moment) => moment.featured);
    return moments;
  }, [momentView, moments]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const updateMoment = (id: number, patch: Partial<Moment>) => {
    setMoments((items) => items.map((moment) => moment.id === id ? { ...moment, ...patch } : moment));
  };

  const archiveMoment = (moment: Moment) => {
    updateMoment(moment.id, { archived: true });
    setOpenMenuId(null);
    notify("Saved to your private archive");
  };

  const featureMoment = (moment: Moment) => {
    const featured = !moment.featured;
    updateMoment(moment.id, { featured, ...(featured ? { archived: true } : {}) });
    setOpenMenuId(null);
    notify(featured ? "Featured on your profile" : "Removed from featured");
  };

  const tabs: Array<{ key: ProfileTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "spaces", label: "Spaces" },
    { key: "history", label: "History" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <main className="nia-profile nia-profile--embedded min-h-[100dvh] text-[#f6f8f5]" data-testid="activity-profile">
      <style>{`
        .activity-profile-surface { background: radial-gradient(ellipse at 90% 0%, rgba(0,207,255,.10), transparent 24rem), #08182b; }
        .activity-profile-card { border: 1px solid rgba(224,247,252,.1); background: #0f243b; }
        .activity-profile-toggle[aria-checked="true"] > span { transform: translateX(1.05rem); background: #08182b; }
        @keyframes profile-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .profile-reveal { animation: profile-rise .38s ease both; }
        @media (prefers-reduced-motion: reduce) { .profile-reveal { animation: none; } }
      `}</style>

      <div className="activity-profile-surface min-h-[100dvh] pb-8">
        <header className="sticky top-0 z-30 border-b border-white/[.09] bg-[#08182b]/95 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[520px] items-center justify-between">
            <div>
              <div className="font-['Fraunces'] text-[21px] font-bold leading-none tracking-[-.05em] text-[#f7f5ec]">Niakofa</div>
              <div className="mt-1 text-[8px] font-extrabold uppercase tracking-[.2em] text-[#72d9ec]">Family · Community · Legacy</div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#00cfff]/25 bg-[#00cfff]/[.07] px-3 py-2 text-[10px] font-bold text-[#bceef5]">
              <Users className="h-3.5 w-3.5 text-[#75dcef]" /> Fort Worth Community
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[520px] px-3 pb-8 pt-4 sm:px-5">
          <nav aria-label="Profile sections" className="mb-4 grid grid-cols-4 rounded-2xl border border-white/[.08] bg-[#0b1f34] p-1">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-current={tab === item.key ? "page" : undefined}
                className={`min-h-11 rounded-xl text-[11px] font-extrabold uppercase tracking-[.12em] transition ${
                  tab === item.key ? "bg-[#00cfff] text-[#08182b] shadow-[0_4px_16px_rgba(0,207,255,.16)]" : "text-[#91a9bd] hover:bg-white/[.05] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {tab === "overview" && (
            <div className="profile-reveal space-y-4">
              <section className="relative overflow-hidden rounded-[1.7rem] border border-white/[.09] bg-[#0e253d] p-5 shadow-[0_20px_50px_rgba(0,0,0,.2)]">
                <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border border-[#00cfff]/[.17]" />
                <div className="absolute -right-2 top-7 h-20 w-20 rounded-full bg-[#ffb703]/[.08] blur-2xl" />
                <div className="relative">
                  <div className="flex items-start gap-4">
                    <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[1.65rem] border border-[#00cfff]/45 bg-[linear-gradient(145deg,#183a53,#0c6a73)] font-['Fraunces'] text-2xl font-bold text-[#c8f8ff] shadow-[0_8px_24px_rgba(0,207,255,.12)]">
                      NJ
                      <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-[#0e253d] bg-[#00cfff] text-[#08182b]">
                        <BadgeCheck className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="min-w-0 pt-1">
                      <SectionLabel>Your place in the Community</SectionLabel>
                      <h1 className="font-['Fraunces'] text-[30px] font-semibold leading-none tracking-[-.04em] text-[#f8f7ed]">Nia James</h1>
                      <p className="mt-2 text-xs font-semibold text-[#73d9ec]">@niajames</p>
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#a8bac7]">
                        <MapPin className="h-3.5 w-3.5 text-[#ffb703]" /> Fort Worth Community
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 border-t border-white/[.09] pt-4">
                    <p className="font-['Fraunces'] text-[19px] leading-[1.25] text-[#eef4ef]">“I show up for the small things close to home.”</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00cfff]/20 bg-[#00cfff]/[.07] px-2.5 py-1.5 text-[10px] font-bold text-[#a4e9f2]">
                        <ShieldCheck className="h-3.5 w-3.5" /> Neighbor, here to help
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[.1] px-2.5 py-1.5 text-[10px] font-semibold text-[#9eb1c2]">
                        <LockKeyhole className="h-3 w-3" /> Owner view
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section aria-label="Profile at a glance" className="grid grid-cols-[1fr_1fr] gap-3">
                <div className="activity-profile-card flex items-center gap-3 rounded-[1.25rem] p-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[.9rem] bg-[#ffb703]/[.13] text-[#f5d17e]"><HeartHandshake className="h-5 w-5" /></div>
                  <div><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-[#839bb0]">Participation</p><p className="mt-0.5 font-['Fraunces'] text-[17px] font-semibold text-[#f3f5ed]">Here, together</p></div>
                </div>
                <div className="activity-profile-card flex items-center gap-3 rounded-[1.25rem] p-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[.9rem] bg-[#00cfff]/[.12] text-[#75dcef]"><BookOpen className="h-5 w-5" /></div>
                  <div><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-[#839bb0]">Moments</p><p className="mt-0.5 font-['Fraunces'] text-[17px] font-semibold text-[#f3f5ed]">{moments.filter((moment) => !moment.archived).length} shared</p></div>
                </div>
              </section>

              <section className="rounded-[1.4rem] border border-[#00cfff]/15 bg-[linear-gradient(110deg,rgba(0,207,255,.08),rgba(15,36,59,.88)_50%)] p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#00cfff]/20 bg-[#08182b]/60 text-[#75dcef]"><Eye className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-[#eaf5f4]">A profile, not a scorecard</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#9eb4c3]">Your shared Moments are for your Community. Personal details and account history stay separate.</p>
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={() => setTab("spaces")}
                className="group flex w-full items-center gap-3 rounded-[1.35rem] border border-[#f0cf7a]/20 bg-[linear-gradient(110deg,rgba(240,207,122,.08),rgba(15,36,59,.9)_55%)] p-4 text-left transition hover:border-[#f0cf7a]/40 focus:outline-none focus:ring-2 focus:ring-[#f0cf7a]/50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f0cf7a]/[.12] text-[#f0cf7a]"><Globe2 className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-extrabold uppercase tracking-[.15em] text-[#c8b981]">Help today. Pay it forward tomorrow.</span>
                  <span className="mt-1 block text-sm font-bold text-[#edf2ed]">One profile, six ways to connect</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-[#98adbd]">Family, Community, Spirals, Hubs, Exchange, and direct messages—kept in their own spaces.</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#a5a98f] transition-transform group-hover:translate-x-0.5" />
              </button>

              <section aria-labelledby="moments-heading" className="pt-1">
                <div className="mb-3 flex items-end justify-between gap-3 px-1">
                  <div>
                    <SectionLabel>Stories from your corner</SectionLabel>
                    <h2 id="moments-heading" className="font-['Fraunces'] text-[25px] font-semibold tracking-[-.035em] text-[#f8f7ed]">Your Moments</h2>
                  </div>
                  <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#90a8bb]"><Users className="h-3 w-3" /> Community-scoped</span>
                </div>

                <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Your Moment views">
                  {([
                    ["published", "Published"],
                    ["archive", "Private archive"],
                    ["featured", "Featured"],
                  ] as Array<[MomentView, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setMomentView(key); setOpenMenuId(null); setDeleteId(null); }}
                      role="tab"
                      aria-selected={momentView === key}
                      className={`min-h-10 shrink-0 rounded-full border px-4 text-[11px] font-extrabold transition ${
                        momentView === key ? "border-[#00cfff]/50 bg-[#00cfff] text-[#08182b]" : "border-white/[.11] bg-[#0e253d] text-[#a9bbca] hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {momentView === "archive" && (
                  <div className="mb-3 flex gap-3 rounded-2xl border border-[#ffb703]/20 bg-[#ffb703]/[.06] p-3.5">
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#e6c978]" />
                    <p className="text-[11px] leading-relaxed text-[#bdc7c9]"><strong className="text-[#f2e5bb]">Only you can browse this opt-in archive.</strong> It holds Moments you chose to save; expired or moderation-held items aren’t shown here.</p>
                  </div>
                )}
                {momentView === "published" && (
                  <p className="mb-3 px-1 text-[11px] leading-relaxed text-[#8fa5b7]">Published to your Community while active. You can save a Moment to your private archive at any time.</p>
                )}
                {momentView === "featured" && (
                  <p className="mb-3 px-1 text-[11px] leading-relaxed text-[#8fa5b7]">A few Community Moments you’ve chosen to feature on your profile.</p>
                )}

                {visibleMoments.length > 0 ? (
                  <div className="space-y-3">
                    {visibleMoments.map((moment) => (
                      <MomentCard
                        key={moment.id}
                        moment={moment}
                        view={momentView}
                        menuOpen={openMenuId === moment.id}
                        deleteConfirm={deleteId === moment.id}
                        onMenu={() => { setOpenMenuId(openMenuId === moment.id ? null : moment.id); setDeleteId(null); }}
                        onArchive={() => archiveMoment(moment)}
                        onFeature={() => featureMoment(moment)}
                        onResponses={() => { updateMoment(moment.id, { responsesEnabled: !moment.responsesEnabled }); notify(`Responses ${moment.responsesEnabled ? "turned off" : "turned on"}`); }}
                        onDeletePrompt={() => { setDeleteId(moment.id); setOpenMenuId(null); }}
                        onDelete={() => {
                          setMoments((items) => items.filter((item) => item.id !== moment.id));
                          setDeleteId(null);
                          notify("Moment removed from this preview");
                        }}
                        onCancelDelete={() => setDeleteId(null)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-[220px] place-items-center rounded-[1.4rem] border border-dashed border-white/[.16] bg-[#0d2237]/70 px-6 py-8 text-center">
                    <div>
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#00cfff]/[.1] text-[#75dcef]">
                        {momentView === "archive" ? <Archive className="h-5 w-5" /> : <Star className="h-5 w-5" />}
                      </div>
                      <h3 className="mt-3 font-['Fraunces'] text-xl font-semibold text-[#f5f5ed]">{momentView === "archive" ? "Your archive is quiet" : "No featured Moments yet"}</h3>
                      <p className="mx-auto mt-1 max-w-[270px] text-xs leading-relaxed text-[#91a7b9]">{momentView === "archive" ? "Save a published Moment when you’d like to keep a private copy." : "Choose Feature from a published Moment to pin it here."}</p>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/[.07] px-3 py-2 text-[10px] text-[#8299ad]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#75dcef]" /> Community Moments · owner controls shown only to you
                </div>
              </section>

              <button type="button" onClick={() => setTab("history")} className="activity-profile-card flex min-h-[74px] w-full items-center gap-3 rounded-[1.25rem] px-4 text-left transition hover:border-[#00cfff]/25">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ffb703]/[.11] text-[#edce82]"><WalletCards className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[9px] font-extrabold uppercase tracking-[.15em] text-[#8ca2b5]">Separate from social activity</span><span className="mt-1 block text-sm font-bold text-[#e8eff0]">Private account history</span></span>
                <ChevronRight className="h-4 w-4 text-[#8199ac]" />
              </button>
            </div>
          )}

          {tab === "spaces" && (
            <section className="profile-reveal space-y-4" aria-labelledby="spaces-heading">
              <header className="relative overflow-hidden rounded-[1.65rem] border border-white/[.09] bg-[#10283d] p-5">
                <div className="absolute -right-7 -top-10 h-40 w-40 rounded-full border border-[#75dcef]/15" />
                <div className="relative">
                  <SectionLabel>Family · Community · Legacy</SectionLabel>
                  <h1 id="spaces-heading" className="font-['Fraunces'] text-[30px] font-semibold tracking-[-.04em] text-[#f7f5ec]">Your spaces</h1>
                  <p className="mt-2 max-w-[340px] text-xs leading-relaxed text-[#a4b7c5]">Niakofa’s mission is “Help Today, Pay It Forward Tomorrow.” This profile can be the front door to its different ways of showing up—without blending their audiences together.</p>
                </div>
              </header>

              <section aria-labelledby="connection-map-heading" className="rounded-[1.4rem] border border-white/[.08] bg-[#0c2137] p-4">
                <div className="mb-3 flex items-end justify-between gap-3 px-1">
                  <div>
                    <SectionLabel>Choose a space</SectionLabel>
                    <h2 id="connection-map-heading" className="font-['Fraunces'] text-[23px] font-semibold tracking-[-.03em] text-[#f8f7ed]">Connection map</h2>
                  </div>
                  <span className="mb-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#7f98ab]">6 spaces</span>
                </div>

                <ul className="space-y-2" aria-label="Niakofa spaces">
                  {profileSpaces.map((space) => {
                    const Icon = space.icon;
                    const selected = selectedSpace === space.key;
                    return (
                      <li key={space.key}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedSpace(space.key)}
                          className={`group flex min-h-[76px] w-full items-center gap-3 rounded-[1.1rem] border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#75dcef]/50 ${
                            selected ? "border-[#75dcef]/35 bg-[#102d47]" : "border-white/[.075] bg-[#0e253d] hover:border-white/[.15] hover:bg-[#112b44]"
                          }`}
                          data-testid={`profile-space-${space.key}`}
                        >
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${space.accent}`}><Icon className="h-[18px] w-[18px]" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[13px] font-extrabold text-[#edf2ed]">{space.title}</span>
                              <span className="text-[9px] font-bold uppercase tracking-[.12em] text-[#7893a9]">{space.kind}</span>
                            </span>
                            <span className="mt-1 block text-[10px] leading-relaxed text-[#95aabd]">{space.description}</span>
                            <span className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-[#d1c58f]"><LockKeyhole className="h-3 w-3" /> {space.audience}</span>
                          </span>
                          <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${selected ? "translate-x-0.5 text-[#75dcef]" : "text-[#70899d] group-hover:translate-x-0.5"}`} />
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {(() => {
                  const ActiveSpaceIcon = activeSpace.icon;
                  return (
                    <div className="mt-3 rounded-[1.15rem] border border-[#00cfff]/15 bg-[linear-gradient(115deg,rgba(0,207,255,.07),rgba(8,24,43,.35))] p-4" aria-live="polite">
                      <div className="flex items-start gap-3">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${activeSpace.accent}`}><ActiveSpaceIcon className="h-[18px] w-[18px]" /></span>
                        <div className="min-w-0">
                          <p className="text-[9px] font-extrabold uppercase tracking-[.16em] text-[#75dcef]">Selected space · {activeSpace.kind}</p>
                          <h3 className="mt-1 text-sm font-extrabold text-[#f3f5ed]">{activeSpace.title}</h3>
                          <p className="mt-1 text-[11px] leading-relaxed text-[#a2b7c6]">{activeSpace.description}</p>
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/[.09] bg-[#08182b]/55 px-2.5 py-1.5 text-[9px] font-bold text-[#d1c58f]"><LockKeyhole className="h-3 w-3" /> Audience: {activeSpace.audience}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </section>

              <section aria-labelledby="creation-controls-heading" className="rounded-[1.4rem] border border-[#f0cf7a]/15 bg-[#0d2237] p-4">
                <div className="px-1">
                  <SectionLabel>Ownership &amp; media controls</SectionLabel>
                  <h2 id="creation-controls-heading" className="font-['Fraunces'] text-[23px] font-semibold tracking-[-.03em] text-[#f8f7ed]">Can I edit or delete my creations?</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#96adbd]">Often yes—but the control belongs to the place where the content was made, and access can depend on your role.</p>
                </div>

                <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Creation control guides">
                  {controlOrder.map((key) => {
                    const label = key === "family" ? "Family" : key === "moments" ? "Moments" : key === "exchange" ? "Exchange" : key === "spirals" ? "Spirals" : "Hubs";
                    const selected = controlView === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        id={`control-tab-${key}`}
                        role="tab"
                        aria-selected={selected}
                        aria-controls="creation-controls-panel"
                        onClick={() => setControlView(key)}
                        className={`min-h-9 shrink-0 rounded-full border px-3 text-[10px] font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#f0cf7a]/50 ${
                          selected ? "border-[#f0cf7a]/50 bg-[#f0cf7a] text-[#172533]" : "border-white/[.1] bg-[#102941] text-[#a9bbca] hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div id="creation-controls-panel" className="mt-3 rounded-[1.15rem] border border-white/[.08] bg-[#102941] p-4" role="tabpanel" aria-labelledby={`control-tab-${controlView}`} aria-live="polite">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#edf2ed]">{activeGuide.title}</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#9eb3c2]">{activeGuide.summary}</p>
                    </div>
                    <span className="rounded-full border border-[#f0cf7a]/20 bg-[#f0cf7a]/[.08] px-2.5 py-1 text-[9px] font-bold text-[#e9d38e]">{activeGuide.status}</span>
                  </div>
                  <ul className="mt-4 space-y-2.5">
                    {activeGuide.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-[11px] leading-relaxed text-[#bdc9cf]">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#75dcef]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 flex gap-2 rounded-xl border border-white/[.07] bg-[#08182b]/55 p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#75dcef]" />
                  <p className="text-[10px] leading-relaxed text-[#8fa6b7]">The profile is a front door, not a cross-app media editor. Keep family stories private, choose the audience for each Spark, and manage an item in its original space.</p>
                </div>
              </section>

              <button type="button" onClick={() => setTab("overview")} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-[#8ee6f4] hover:bg-white/[.05]">
                <ChevronRight className="h-4 w-4 rotate-180" /> Back to your Community profile
              </button>
            </section>
          )}

          {tab === "history" && (
            <section className="profile-reveal space-y-4">
              <header className="relative overflow-hidden rounded-[1.65rem] border border-white/[.09] bg-[#10283d] p-5">
                <div className="absolute -right-5 -top-8 h-36 w-36 rounded-full border border-[#ffb703]/20" />
                <SectionLabel>Private account activity</SectionLabel>
                <h1 className="font-['Fraunces'] text-[30px] font-semibold tracking-[-.04em] text-[#f7f5ec]">History</h1>
                <p className="mt-2 max-w-[330px] text-xs leading-relaxed text-[#a4b7c5]">A separate record of account transactions. This isn’t part of your Community Moments.</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/[.12] bg-[#08182b]/40 px-3 py-1.5 text-[10px] font-bold text-[#a9bdca]">
                  <LockKeyhole className="h-3.5 w-3.5 text-[#e3c979]" /> Visible only in your account
                </div>
              </header>
              <div className="flex items-center justify-between px-1">
                <div><SectionLabel>Recent entries</SectionLabel><h2 className="font-['Fraunces'] text-xl font-semibold text-[#f6f5ed]">Account timeline</h2></div>
                <span className="text-[10px] font-bold text-[#8299ad]">June 2025</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: "Help request completed", detail: "Community exchange", date: "Jun 12", mark: "complete" },
                  { label: "Contribution recorded", detail: "Community pool", date: "Jun 08", mark: "contribution" },
                  { label: "Pledge received", detail: "Account activity", date: "Jun 02", mark: "pledge" },
                ].map((entry) => (
                  <article key={entry.label} className="activity-profile-card flex items-center gap-3 rounded-[1.2rem] p-4">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${entry.mark === "complete" ? "bg-[#00cfff]/[.1] text-[#75dcef]" : "bg-[#ffb703]/[.11] text-[#e5c579]"}`}>
                      {entry.mark === "complete" ? <Check className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-[#edf2ed]">{entry.label}</span>
                      <span className="mt-1 block text-[10px] text-[#8ea4b5]">{entry.detail}</span>
                    </span>
                    <span className="text-[10px] font-semibold text-[#91a7b8]">{entry.date}</span>
                  </article>
                ))}
              </div>
              <p className="rounded-2xl border border-white/[.08] bg-[#0d2237] p-4 text-[11px] leading-relaxed text-[#95aabc]">
                Amounts and payment details are not displayed on this profile. Visit your account’s wallet for transaction details.
              </p>
              <button type="button" onClick={() => setTab("overview")} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-[#8ee6f4] hover:bg-white/[.05]">
                <ChevronRight className="h-4 w-4 rotate-180" /> Back to your Community profile
              </button>
            </section>
          )}

          {tab === "settings" && (
            <section className="profile-reveal space-y-4">
              <header className="rounded-[1.65rem] border border-white/[.09] bg-[#10283d] p-5">
                <SectionLabel>Your space, your boundaries</SectionLabel>
                <h1 className="font-['Fraunces'] text-[30px] font-semibold tracking-[-.04em] text-[#f7f5ec]">Settings</h1>
                <p className="mt-2 text-xs leading-relaxed text-[#a4b7c5]">Manage the account controls and safety links already available in Niakofa.</p>
              </header>
              <div className="activity-profile-card rounded-[1.35rem] p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#00cfff]/[.1] text-[#75dcef]"><Eye className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-[#edf3ef]">Appearance</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#98adbd]">Choose the color mode for your profile.</p>
                  </div>
                  <button
                    type="button"
                    className={`activity-profile-toggle relative mt-1 h-6 w-11 shrink-0 rounded-full p-[3px] transition ${darkModeOn ? "bg-[#00cfff]" : "bg-[#32465b]"}`}
                    role="switch"
                    aria-checked={darkModeOn}
                    aria-label="Dark appearance"
                    onClick={() => { setDarkModeOn(!darkModeOn); notify("Appearance changed in this demo"); }}
                  >
                    <span className={`block h-[18px] w-[18px] rounded-full transition-transform ${darkModeOn ? "translate-x-[1.05rem] bg-[#08182b]" : "bg-[#bdc9d2]"}`} />
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-[1.35rem] border border-white/[.09] bg-[#0f243b]">
                <div className="border-b border-white/[.08] px-4 py-3">
                  <p className="text-[9px] font-extrabold uppercase tracking-[.16em] text-[#839bb0]">Account</p>
                </div>
                <button type="button" onClick={() => notify("Notification preferences are available in the full app")} className="flex min-h-14 w-full items-center gap-3 border-b border-white/[.08] px-4 text-left transition hover:bg-white/[.04]">
                  <Clock3 className="h-4 w-4 text-[#75dcef]" />
                  <span className="min-w-0 flex-1 text-xs font-bold text-[#e7efef]">Notification preferences</span>
                  <ChevronRight className="h-4 w-4 text-[#8199ac]" />
                </button>
                <button type="button" onClick={() => notify("Account details are managed in Settings")} className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition hover:bg-white/[.04]">
                  <Users className="h-4 w-4 text-[#75dcef]" />
                  <span className="min-w-0 flex-1 text-xs font-bold text-[#e7efef]">Account details</span>
                  <ChevronRight className="h-4 w-4 text-[#8199ac]" />
                </button>
              </div>
              <div className="overflow-hidden rounded-[1.35rem] border border-white/[.09] bg-[#0f243b]">
                <div className="border-b border-white/[.08] px-4 py-3">
                  <p className="text-[9px] font-extrabold uppercase tracking-[.16em] text-[#839bb0]">Support &amp; safety</p>
                </div>
                {[
                  { label: "Privacy & data", icon: LockKeyhole },
                  { label: "Community guidelines", icon: BookOpen },
                  { label: "Help center", icon: ShieldCheck },
                ].map(({ label, icon: Icon }) => (
                  <button key={label} type="button" onClick={() => notify(`${label} opens in the full app`)} className="flex min-h-14 w-full items-center gap-3 border-b border-white/[.08] px-4 text-left last:border-b-0 transition hover:bg-white/[.04]">
                    <Icon className="h-4 w-4 text-[#75dcef]" />
                    <span className="min-w-0 flex-1 text-xs font-bold text-[#e7efef]">{label}</span>
                    <ChevronRight className="h-4 w-4 text-[#8199ac]" />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setShowSettingsNote((value) => !value)} aria-expanded={showSettingsNote} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-white/[.08] bg-[#0d2237] px-4 text-left text-xs font-bold text-[#cedbe2]">
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#75dcef]" /> Privacy at a glance</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showSettingsNote ? "rotate-180" : ""}`} />
              </button>
              {showSettingsNote && (
                <div className="rounded-2xl border border-[#00cfff]/15 bg-[#00cfff]/[.045] p-4 text-[11px] leading-relaxed text-[#a8bac8]">
                  <p className="font-extrabold text-[#dff6f8]">Your profile belongs to you.</p>
                  <p className="mt-1.5">Moments follow their Community audience. The archive is private and opt-in; account history stays separate. This preview uses sample content and does not save changes.</p>
                </div>
              )}
            </section>
          )}

          <footer className="mt-8 flex flex-col items-center gap-2 border-t border-white/[.08] px-3 pt-5 text-center">
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.15em] text-[#6f879d]"><ShieldCheck className="h-3 w-3 text-[#00cfff]" /> A neighbor-first space</span>
            <p className="max-w-[300px] text-[10px] leading-relaxed text-[#71889d]">Sample profile for Niakofa. Your private account history and Community Moments remain distinct.</p>
          </footer>
        </div>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#00cfff]/25 bg-[#142d45] px-4 py-3 text-xs font-bold text-[#e7f8f8] shadow-[0_12px_34px_rgba(0,0,0,.38)]">
          <Check className="h-4 w-4 text-[#75dcef]" /> {toast}
        </div>
      )}
    </main>
  );
}
