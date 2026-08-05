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

  "/inbox": {
    key: "/inbox",
    title: "Inbox",
    blurb: "Every inbound message, triaged by Luna into what needs you first.",
    steps: [
      { title: "Work the lanes", body: "Luna sorts inbound messages into Today, This week and Later, so you answer the ones that matter before the ones that can wait." },
      { title: "Read with context", body: "Click a message to see a mini customer card beside it — who they are and their recent history — without leaving the inbox." },
      { title: "Reply with a head start", body: "Each message comes with ranked draft replies. Pick one and edit, or “Draft with Luna” to regenerate. Nothing sends until you press send." },
      { title: "Clear it", body: "Send or mark it handled and it drops out of the lane, so the inbox always shows what's still open." },
    ],
    tips: [
      "The lane is Luna's suggestion, not a rule — you can open anything from any lane.",
      "A reply that bounces reopens the thread, so “sent” always means actually delivered.",
      "The number on the Inbox menu item is how many messages need you today.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Luna triages every message", body: "Inbound mail is read and sorted for you as it arrives, so the inbox is a worklist, not a pile." },
      { selector: '[data-tour="inbox-lanes"]', title: "Today, this week, later", body: "Messages are bucketed by when they need you. Start at Today and work down." },
      { selector: '[data-tour="inbox-list"]', title: "Open a message", body: "Click one to see the customer's mini-card beside it and ranked draft replies — pick one, edit, and send. Nothing sends until you do." },
    ],
    cta: { href: "/inbox", label: "Go to the Inbox" },
  },

  "/enquiries": {
    key: "/enquiries",
    title: "Enquiries",
    blurb: "The front door — every new request, with a response clock already running.",
    steps: [
      { title: "See what's waiting", body: "New enquiries land here the moment they arrive, each with a first-response countdown so nothing slips." },
      { title: "Let Luna read it", body: "Paste the customer's email and “Read with Luna” fills the form for you. You review before anything saves; their original wording stays on the record." },
      { title: "Check the scores", body: "Four honest scores — likelihood, value, urgency and fit — help you decide where to spend your time." },
      { title: "Act", body: "Respond to the customer, Convert to a trip when it's real, or Close with a reason so the record stays honest." },
    ],
    tips: [
      "Website widget leads arrive here automatically — scored and deduped against existing customers.",
      "The response clock is what powers “N enquiries waiting” on the dashboard; clear them to keep it green.",
      "Closing with a reason feeds Reports, so you learn why enquiries don't convert.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Log a new enquiry", body: "New enquiry up here. Paste the customer's email and “Read with Luna” fills the form; you review before it saves." },
      { selector: '[data-tour="enq-tabs"]', title: "Filter by status", body: "New, working, converted, closed — with a count on each, so you can see the queue at a glance." },
      { selector: '[data-tour="enq-list"]', title: "The queue, on the clock", body: "Each enquiry shows its response countdown and four scores (likelihood, value, urgency, fit). Open one to respond, convert it to a trip, or close it with a reason." },
    ],
    cta: { href: "/enquiries", label: "Go to Enquiries" },
  },

  "/customers": {
    key: "/customers",
    title: "Customers",
    blurb: "Everyone you look after — searchable in plain English, one click to their full record.",
    steps: [
      { title: "Find anyone", body: "Type a plain-English search like “families who went to Greece and have gone quiet” and Luna turns it into a filter." },
      { title: "Save a segment", body: "Keep a search you'll reuse. The chips along the top show a live count for each, so you can see the size of a group at a glance." },
      { title: "Act on a group", body: "Select customers (or the whole filter) to add a tag, add them to a journey, or send a service email." },
      { title: "Open a record", body: "Click any customer for their 360 — Luna's brief, how they travel with every fact cited, the full timeline, and the best next steps." },
    ],
    tips: [
      "Add a customer with the button top-right; the address look-up fills the rest from a postcode.",
      "Search matches names, emails and phone numbers, so a half-remembered detail is enough.",
      "Marketing consent is tracked per channel — bulk marketing only reaches customers who agreed.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Add a customer, any time", body: "The button up here adds a customer — the address look-up fills the rest from just a postcode." },
      { selector: '[data-tour="cust-search"]', title: "Search in plain English", body: "Describe who you want — “families who went to Greece and have gone quiet” — and Luna turns it into a filter." },
      { selector: '[data-tour="cust-segments"]', title: "Saved segments", body: "Reusable groups, each with a live count. Click one to filter to it in a tap." },
      { selector: '[data-tour="cust-list"]', title: "Your customers", body: "Click anyone for their full 360. Select several to act on them together — a tag, a journey, or a service email." },
    ],
    cta: { href: "/customers", label: "Go to Customers" },
  },

  "/trips": {
    key: "/trips",
    title: "Trips",
    blurb: "Your pipeline as a board — every trip from enquiry to returned.",
    steps: [
      { title: "Read the board", body: "Each column is a stage; each card a trip. The column total shows the value sitting in that stage." },
      { title: "Move a trip on", body: "Drag a card to the next stage, or use the stage dropdown on touch and keyboard." },
      { title: "Open a trip", body: "Click a card to see its detail and the customer behind it." },
      { title: "Keep it current", body: "Moving cards as things happen is what makes the pipeline — and the forecast built on it — trustworthy." },
    ],
    tips: [
      "Cancelled trips sit behind a toggle, so the board shows live business by default.",
      "The forecast's stage weights come straight from this board — an honest board is an honest forecast.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Your pipeline", body: "The whole board, enquiry to returned. The header carries the pipeline summary and the cancelled-trips toggle." },
      { selector: '[data-tour="trips-board"]', title: "Drag trips along", body: "Each column is a stage, each card a trip, and the column total shows the value sitting there. Drag a card on, or use its stage dropdown. Click a card to open it." },
    ],
    cta: { href: "/trips", label: "Go to Trips" },
  },

  "/quotes": {
    key: "/quotes",
    title: "Quotes",
    blurb: "Every priced proposal tracked — and rescued before it goes cold.",
    steps: [
      { title: "See the state of each quote", body: "Sent, viewed, expiring, versions, and the customer's own words, all in one place." },
      { title: "Catch the ones at risk", body: "Luna's rescue strip flags quotes viewed several times with no reply, expiring soon, or sent but never opened — and names the best next move." },
      { title: "Follow up", body: "Act on a flagged quote straight from the strip, while there's still time to save it." },
      { title: "Book it", body: "Accepting a quote books the trip at that price in one click." },
    ],
    tips: [
      "“Viewed four times, no reply” usually means an unasked question — a quick call beats another email.",
      "An expiring quote is a reason to make contact, not just a deadline.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Every priced proposal", body: "Sent, viewed, expiring, versioned — all tracked in one place." },
      { selector: '[data-tour="quotes-rescue"]', title: "Quote rescue", body: "Luna flags the quotes at risk — viewed with no reply, expiring soon, never opened — and names the best next move, so you act before they go cold." },
    ],
    cta: { href: "/quotes", label: "Go to Quotes" },
  },

  "/service": {
    key: "/service",
    title: "Service",
    blurb: "Customer problems as cases, ranked by real travel urgency.",
    steps: [
      { title: "See what's most urgent", body: "Each case carries a priority Luna computes from context — someone travelling right now outranks a routine post-trip question." },
      { title: "Understand the ranking", body: "Hover the P-badge to see exactly why a case sits where it does. Each priority has a resolution target and a countdown." },
      { title: "Work it", body: "Start a case, mark it Waiting when the ball is with someone else, and Resolve it with the outcome." },
      { title: "Keep the record", body: "The resolution lands on the customer's timeline, so their history stays complete." },
    ],
    tips: [
      "Raise a case here or from a customer's record — either way it's linked to them and their trip.",
      "A case for a customer in resort is meant to jump the queue; that's the system working.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Cases, by urgency", body: "Every customer problem becomes a case, ranked by real travel context." },
      { selector: '[data-tour="service-tabs"]', title: "Work the queue", body: "Switch between open, waiting and resolved. Each case has a priority and a countdown — hover its P-badge to see exactly why Luna ranked it there." },
    ],
    cta: { href: "/service", label: "Go to Service" },
  },

  "/sequences": {
    key: "/sequences",
    title: "Sequences",
    blurb: "A chase that runs over days, and stops itself the moment it should.",
    steps: [
      { title: "Understand the shape", body: "A sequence follows up on a schedule — day 0, day 4, day 10 — instead of one email and hope." },
      { title: "Trust the stop", body: "It ends the moment they reply, the quote is answered, or the address turns out to be dead. That's what keeps it service, not nagging." },
      { title: "Review each step", body: "Steps arrive in Tasks for you to approve by default — nothing goes out unseen." },
      { title: "Go hands-off (optional)", body: "Letting a sequence send on its own is a separate, deliberate switch that you control." },
    ],
    tips: [
      "Use a sequence for the follow-ups you'd forget; keep the personal ones personal.",
      "If a sequence stops early, that's a good sign — it means the customer responded.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Chases that run themselves", body: "A follow-up spread over days that stops the moment it should." },
      { selector: '[data-tour="sequences-main"]', title: "Install and review", body: "Start with the quote-chase starter — it installs paused and in review, so you read every step before anything goes out." },
    ],
    cta: { href: "/sequences", label: "Go to Sequences" },
  },

  "/journeys": {
    key: "/journeys",
    title: "Journeys",
    blurb: "Auto-pilot — rules that watch your customers and do the follow-ups for you.",
    steps: [
      { title: "Start with the starters", body: "Install the four ready-made journeys, then Run to see who's eligible right now." },
      { title: "Build your own in words", body: "Describe a rule in plain English — “when a quote over £5,000 isn't answered in 3 days, create a call task” — and Luna builds it." },
      { title: "Check before it runs", body: "Review Luna's plain explanation and a live dry-run before switching a journey on." },
      { title: "Stay in control", body: "Journeys queue tasks and drafts for your review. Nothing sends without you." },
    ],
    tips: [
      "A dry-run shows exactly who a journey would act on today, so there are no surprises.",
      "Journeys and sequences pair up: a journey decides who to chase, a sequence runs the chase.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Auto-pilot", body: "Rules that watch your customers and do the follow-ups for you." },
      { selector: ".rgrid-journeys", title: "Your journeys", body: "Install the starters and Run to see who's eligible now, or describe a new rule in plain English. Review Luna's dry-run before switching one on." },
    ],
    cta: { href: "/journeys", label: "Go to Journeys" },
  },

  "/tasks": {
    key: "/tasks",
    title: "Tasks",
    blurb: "Your work queue — everything that needs doing, in one list.",
    steps: [
      { title: "Work top-down", body: "Tasks are bucketed by due date, so today's work sits together at the top." },
      { title: "See where they came from", body: "Tasks Luna queues from journeys and sequences arrive here for you to action." },
      { title: "Clear each one", body: "Complete it, snooze it to resurface later, or reopen one you closed too soon." },
      { title: "Add your own", body: "Create a task for anything — from here, or straight from a customer's record, pre-filled." },
    ],
    tips: [
      "Assign a task to a teammate and it shows up in their queue.",
      "Snoozing is honest procrastination — it keeps the task, just not today.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Your work queue", body: "Everything that needs doing, including the follow-ups Luna queues." },
      { selector: '[data-tour="tasks-filters"]', title: "By due date", body: "Tasks are bucketed so today's work sits together. Complete, snooze or reopen each one — and add your own from the button top-right." },
    ],
    cta: { href: "/tasks", label: "Go to Tasks" },
  },

  "/commission": {
    key: "/commission",
    title: "Commission",
    blurb: "What you earned, and who still owes you — the agency's income, not turnover.",
    steps: [
      { title: "See your income", body: "Unlike the other money screens, which show the holiday price, this shows your commission — earned, and still outstanding." },
      { title: "Chase what's late", body: "The ageing view flags commission overdue from suppliers, oldest first, so you know who to nudge." },
      { title: "Trust the total", body: "Only booked trips count; enquiries, quotes and cancellations are excluded. A booking with no rate recorded is named “unknown”, never guessed." },
      { title: "Fix the gaps", body: "Set a missing rate so the booking counts properly toward your earnings." },
    ],
    tips: [
      "A total that quietly drops bookings is worse than none — that's why unknowns are shown, not hidden.",
      "Commission is tracked per booking and per supplier, so you can see who's slow to pay.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Your income", body: "Not turnover — the agency's commission, earned and outstanding." },
      { selector: '[data-tour="commission-figures"]', title: "Earned, and what's late", body: "Received, invoiced, expected and overdue at a glance. Only booked trips count; a booking with no rate is named “unknown”, never guessed." },
    ],
    cta: { href: "/commission", label: "Go to Commission" },
  },

  "/reports": {
    key: "/reports",
    title: "Reports",
    blurb: "The numbers, and what's changing — with the working behind every figure.",
    steps: [
      { title: "Read the headlines", body: "Booked revenue, open pipeline, conversion, and your top destinations and sources." },
      { title: "See what's moving", body: "Luna's trend panel says what's changed — enquiries, destinations, response times — with the numbers behind each claim." },
      { title: "Look ahead", body: "The forecast weights your open pipeline by stage (weights shown) and maps committed vs potential revenue by departure month." },
      { title: "Act on it", body: "Turn a weak spot — a slow response time, a source that isn't converting — into this week's focus." },
    ],
    tips: [
      "Every claim links to its numbers, so a report is the start of a question, not the end.",
      "Conversion and sources come straight from how you close enquiries — honest inputs, honest reports.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "The numbers", body: "Revenue, pipeline, conversion, destinations and sources." },
      { selector: '[data-tour="reports-ranges"]', title: "Pick a window", body: "Switch the date range and the whole page follows. Luna's trend panel says what's changed, and the forecast weights your pipeline by stage." },
    ],
    cta: { href: "/reports", label: "Go to Reports" },
  },

  "/settings": {
    key: "/settings",
    title: "Settings",
    blurb: "Your workspace, your team, and how Luna writes for you.",
    steps: [
      { title: "Set the house style", body: "Tell Luna how your agency writes, and she'll hold to it in every draft she makes." },
      { title: "Manage your team", body: "Invite colleagues and set who can do what." },
      { title: "Check your integrations", body: "See what's connected — email, and the website widgets feeding enquiries in." },
      { title: "Watch compliance", body: "Live GDPR, marketing-consent and passport figures, so you can see your standing at a glance." },
    ],
    tips: [
      "The house style is the biggest lever on how “you” Luna's drafts sound — worth a few minutes.",
      "The compliance figures are live, not a report you run — they reflect your data right now.",
    ],
    walkthrough: [
      { selector: ".app-main > header", title: "Your workspace", body: "Identity, team, integrations and compliance, all in one place." },
      { selector: '[data-tour="settings-main"]', title: "Set it up", body: "Set the house style Luna writes in, invite your team, check what's connected, and watch your live GDPR and passport figures." },
    ],
    cta: { href: "/settings", label: "Go to Settings" },
  },
};

/** The guide for a nav href, if one has been written yet. */
export function getGuide(key: string): SectionGuide | undefined {
  return SECTION_GUIDES[key];
}
