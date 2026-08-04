/**
 * Per-section help guides — the content behind the "?" on each sidebar item.
 *
 * ADOPTION FIRST. Luna Work is broad, and a broad product only gets used if
 * every screen explains itself. Each guide is a short, concrete walkthrough of
 * one section: what it's for, the steps to work it, and a few tips that save
 * time. Keyed by the nav item's href so the sidebar can look one up directly.
 *
 * A section only shows its "?" once it has a guide here, so this file is the
 * single place to roll the help out screen by screen: add a SectionGuide and
 * its icon appears. Copy style: warm, plain, UK English — say what to do, not
 * how the software works.
 *
 * `walkthrough` is optional. When present, the guide drawer offers a "Show me
 * on the page" button that runs a spotlight tour — each step highlights a real
 * element on the screen (by CSS selector) and explains it in place.
 */

export type GuideStep = { title: string; body: string };

/** One spotlight step: the element to highlight and what to say about it. */
export type WalkStep = { selector: string; title: string; body: string };

export type SectionGuide = {
  /** Matches the sidebar nav href, e.g. "/" or "/customers". */
  key: string;
  /** The section name, shown as the guide title. */
  title: string;
  /** One line: what this screen is for. */
  blurb: string;
  /** The step-by-step walkthrough. */
  steps: GuideStep[];
  /** A few key tips — the things that aren't obvious. */
  tips: string[];
  /** Optional interactive spotlight tour of the live screen. */
  walkthrough?: WalkStep[];
  /** Where "Take me there" goes. Defaults to the guide key. */
  cta?: { href: string; label: string };
};

export const SECTION_GUIDES: Record<string, SectionGuide> = {
  "/": {
    key: "/",
    title: "Dashboard",
    blurb: "Your morning briefing — what needs you today, in one line.",
    steps: [
      {
        title: "Start with the one-line brief",
        body: "At the top, Luna reads everything on your plate and sums up the day in a sentence — greeting you by name and flagging who is travelling right now. Read this first: it tells you whether today is calm or busy before you scroll.",
      },
      {
        title: "Ask Luna a quick question",
        body: "Under the greeting is a question box with a few ready-made prompts — “who's travelling next month?”, “which quotes are at risk?”. Type your own or tap a prompt to get a straight answer without leaving the page.",
      },
      {
        title: "Work the “Needs you today” list",
        body: "One ranked list pulls together the four things that would otherwise be scattered: enquiries on the response clock, quotes going cold, messages triaged as urgent, and overdue tasks. Each row says why it's there. Click one to jump straight to it and act.",
      },
      {
        title: "Spot what Luna noticed",
        body: "Luna's own observations sit in the same list, marked so you can tell them apart — a rebooking window opening, a customer gone quiet, a passport that won't last the trip. All computed from real records, never guessed, so you can act with confidence.",
      },
      {
        title: "Scan the glance line",
        body: "The quiet row of numbers at the bottom — customers, live pipeline, departing soon, enquiries waiting, open cases, open tasks — is your at-a-glance health check. Every figure is a link, so click one to open the screen behind it.",
      },
    ],
    tips: [
      "Clear the top of the “Needs you today” list before anything else — it's ordered by what matters most.",
      "The list shows the most pressing items; clear a few and the next ones move up to take their place.",
      "Every number links to the records behind it, so you can always check the working.",
      "Press Cmd/Ctrl + P to jump to any customer, trip or screen from anywhere.",
      "Ask Luna (bottom-right, or Cmd/Ctrl + K) answers plain-English questions any time, from any screen.",
    ],
    walkthrough: [
      {
        selector: '[data-tour="dash-brief"]',
        title: "Your day in one line",
        body: "Luna sums up everything on your plate here, and tells you who is travelling right now.",
      },
      {
        selector: '[data-tour="dash-ask"]',
        title: "Ask Luna anything",
        body: "Type a plain-English question, or tap one of the ready-made prompts, for a straight answer in place.",
      },
      {
        selector: '[data-tour="dash-today"]',
        title: "What needs you today",
        body: "One ranked list: overdue enquiries, cooling quotes, urgent messages, tasks — plus Luna's own observations, marked. Click any row to act.",
      },
      {
        selector: '[data-tour="dash-glance"]',
        title: "Your numbers at a glance",
        body: "A quiet health check. Every figure is a link to the screen behind it.",
      },
    ],
    cta: { href: "/", label: "Go to the Dashboard" },
  },
};

/** The guide for a nav href, if one has been written yet. */
export function getGuide(key: string): SectionGuide | undefined {
  return SECTION_GUIDES[key];
}
