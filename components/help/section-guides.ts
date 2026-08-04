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
 */

export type GuideStep = { title: string; body: string };

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
        body: "At the top, Luna reads everything on your plate and sums up the day in a sentence, greeting you by name and flagging who is travelling right now. Read this first — it tells you whether today is calm or busy before you scroll.",
      },
      {
        title: "Work the “Needs you today” list",
        body: "One ranked list pulls together the four things that would otherwise be scattered: enquiries on the response clock, quotes going cold, messages triaged as urgent, and overdue tasks. Each row shows why it is where it is. Click one to jump straight to it and act.",
      },
      {
        title: "Scan the glance line",
        body: "The quiet row of numbers — customers, pipeline, departing soon, enquiries waiting, open cases, open tasks — is your at-a-glance health check. Every figure is a link, so click one to open the screen behind it.",
      },
      {
        title: "Check what Luna noticed",
        body: "Below the list, Luna surfaces things it spotted for you: rebooking windows opening, customers who have gone quiet, passports that won't last the trip. These are computed from real records, never guessed, so you can act on them with confidence.",
      },
      {
        title: "See what ran overnight",
        body: "The auto-pilot strip shows the follow-ups Luna handled in the background — chases sent, journeys advanced — so nothing happens to your customers without you being able to see it.",
      },
    ],
    tips: [
      "Clear the top of the “Needs you today” list before anything else — it is ordered by what matters most.",
      "Every number links to the records behind it, so you can always check the working.",
      "Press Cmd/Ctrl + P to jump to any customer, trip or screen from anywhere.",
      "Ask Luna (bottom-right, or Cmd/Ctrl + K) answers plain-English questions like “who is departing next week?”.",
    ],
    cta: { href: "/", label: "Go to the Dashboard" },
  },
};

/** The guide for a nav href, if one has been written yet. */
export function getGuide(key: string): SectionGuide | undefined {
  return SECTION_GUIDES[key];
}
