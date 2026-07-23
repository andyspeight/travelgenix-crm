/**
 * Product-tour steps. Two groups: "Setup" (get the workspace ready) and
 * "Features" (one per screen). Each step can deep-link to the screen it
 * describes via `href` + `cta`, so the tour doubles as a guided walk-through.
 *
 * Keep copy short and concrete: what the screen is for, and the one or two
 * things to try.
 */

export type TourStep = {
  group: "Setup" | "Feature" | "Finish";
  title: string;
  points: string[];
  href?: string;
  cta?: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    group: "Setup",
    title: "Welcome to Luna Work",
    points: [
      "The travel-native CRM with Luna, your AI, doing the follow-ups nobody has time for.",
      "This quick tour covers set-up and every screen. It takes about two minutes.",
      "You can skip now and reopen it any time from Take a tour at the bottom of the sidebar.",
    ],
  },
  {
    group: "Setup",
    title: "Get your data in",
    points: [
      "Exploring? Open Customers and use Seed demo data to load 30 sample households.",
      "Going live? Add your own customers instead, and clear the demo data when ready.",
      "Optional: set ANTHROPIC_API_KEY for live AI (briefs, drafts, Ask). Everything still works without it.",
      "Run the segments migration in Supabase to enable Save segment.",
    ],
    href: "/customers",
    cta: "Open Customers",
  },
  {
    group: "Setup",
    title: "Two ways to move fast",
    points: [
      "Quick find: press Cmd/Ctrl+P (or the search box top of the sidebar) to jump to any customer, trip or page.",
      "Ask Luna: the button bottom-right (Cmd/Ctrl+K) answers plain-English questions about your customers and trips.",
    ],
  },
  {
    group: "Feature",
    title: "Dashboard",
    points: [
      "Your morning briefing: what needs you today, in one sentence.",
      "KPIs, pipeline by stage, upcoming departures and recent activity at a glance.",
      "The auto-pilot strip shows what Luna did in the background.",
    ],
    href: "/",
    cta: "Open Dashboard",
  },
  {
    group: "Feature",
    title: "Enquiries — the front door",
    points: [
      "Every new request lands here with a first-response clock already running.",
      "Paste the customer's email and Read with Luna fills the form; you review, then save. Their original wording stays on the record.",
      "Four honest scores per enquiry (likelihood, value, urgency, fit), then Respond, Convert to trip or Close with a reason.",
    ],
    href: "/enquiries",
    cta: "Open Enquiries",
  },
  {
    group: "Feature",
    title: "Customers & smart segments",
    points: [
      "Describe who you want in plain English, e.g. 'families who went to Greece and have gone quiet'.",
      "Save a segment to reuse it, or act on a group: Email all, Add tag, Add to journey.",
      "Click any customer to open their full record.",
    ],
    href: "/customers",
    cta: "Open Customers",
  },
  {
    group: "Feature",
    title: "Customer 360",
    points: [
      "Luna's brief, predictions and a full timeline of every interaction.",
      "Next steps suggests the best actions; the Do buttons create tasks or open a reply.",
      "Add a note, draft a reply, or schedule a call right from the record.",
    ],
    href: "/customers",
    cta: "Pick a customer",
  },
  {
    group: "Feature",
    title: "Inbox",
    points: [
      "Luna triages every inbound message into Today / This week / Later lanes.",
      "Each message comes with ranked reply drafts; Draft with Luna regenerates them live.",
      "The mini customer card gives you context without leaving the inbox.",
    ],
    href: "/inbox",
    cta: "Open Inbox",
  },
  {
    group: "Feature",
    title: "Trips pipeline",
    points: [
      "A Kanban board of every trip from enquiry to returned.",
      "Drag a card between stages, or use the stage dropdown on touch and keyboard.",
      "Column totals show the value sitting in each stage.",
    ],
    href: "/trips",
    cta: "Open Trips",
  },
  {
    group: "Feature",
    title: "Quotes & Quote Rescue",
    points: [
      "Every priced proposal tracked: sent, viewed, expiry, versions, the customer's actual words.",
      "Luna's rescue strip flags quotes at risk — viewed four times with no reply, expiring in two days, sent but never opened — and names the best intervention.",
      "Accepting a quote books the trip at that price in one click.",
    ],
    href: "/quotes",
    cta: "Open Quotes",
  },
  {
    group: "Feature",
    title: "Journeys (auto-pilot)",
    points: [
      "Rules that watch your customers and do the follow-ups for you.",
      "Install the four starter journeys, then Run to see who's eligible now.",
      "Luna queues tasks and drafts for your review. Nothing sends without you.",
    ],
    href: "/journeys",
    cta: "Open Journeys",
  },
  {
    group: "Feature",
    title: "Tasks",
    points: [
      "The work queue. Everything Luna queues from journeys lands here.",
      "Bucketed by due date; complete, snooze or reopen each one.",
    ],
    href: "/tasks",
    cta: "Open Tasks",
  },
  {
    group: "Feature",
    title: "Reports",
    points: [
      "Booked revenue, open pipeline, conversion, destinations and sources.",
      "Flip between this year, last 12 months and all time instantly.",
    ],
    href: "/reports",
    cta: "Open Reports",
  },
  {
    group: "Feature",
    title: "Settings",
    points: [
      "Your workspace, team, and how Luna writes (the house style she enforces).",
      "Integration status and live compliance figures (GDPR, marketing, passports).",
    ],
    href: "/settings",
    cta: "Open Settings",
  },
  {
    group: "Finish",
    title: "You're ready",
    points: [
      "That's the whole product. Start from the Dashboard and follow what needs you today.",
      "Reopen this tour any time from Take a tour at the bottom of the sidebar.",
    ],
    href: "/",
    cta: "Go to Dashboard",
  },
];
