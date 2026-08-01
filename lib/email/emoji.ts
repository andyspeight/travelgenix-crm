/**
 * Emoji — a short, useful list rather than the whole of Unicode.
 *
 * A picker with 3,600 emoji is a worse tool than one with sixty: nobody
 * scrolls, and an agent writing to a customer about their honeymoon wants the
 * palm tree, the plane and the champagne, not the full grid. So this is
 * curated for travel, and searchable by the words an agent would actually
 * type ("beach", "flight", "sorry").
 *
 * Kept as data with no images and no font loading, so nothing here reaches
 * out to a CDN and every emoji renders in whatever the reader already has.
 *
 * A note we surface in the UI rather than hide: emoji in a SUBJECT line can
 * nudge some spam filters. In the body they are ordinary text.
 *
 * Pure data, no I/O.
 */

export type Emoji = { char: string; name: string; keywords: string };

export type EmojiGroup = { label: string; emoji: Emoji[] };

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: "Travel",
    emoji: [
      { char: "✈️", name: "plane", keywords: "flight fly travel airport departure" },
      { char: "🏖️", name: "beach", keywords: "beach sand sea sun holiday resort" },
      { char: "🌴", name: "palm tree", keywords: "palm tropical island beach" },
      { char: "🏝️", name: "island", keywords: "island tropical desert" },
      { char: "🛳️", name: "cruise ship", keywords: "cruise ship sailing boat" },
      { char: "🚢", name: "ship", keywords: "ship ferry boat" },
      { char: "🏨", name: "hotel", keywords: "hotel accommodation stay room" },
      { char: "🏰", name: "castle", keywords: "castle city break europe" },
      { char: "🗺️", name: "map", keywords: "map itinerary route plan" },
      { char: "🧳", name: "luggage", keywords: "luggage suitcase baggage packing" },
      { char: "🛂", name: "passport control", keywords: "passport visa border immigration" },
      { char: "🚗", name: "car", keywords: "car hire transfer drive" },
      { char: "🚆", name: "train", keywords: "train rail eurostar" },
      { char: "⛰️", name: "mountain", keywords: "mountain hiking walking" },
      { char: "🎿", name: "ski", keywords: "ski skiing snow winter slopes" },
      { char: "🐠", name: "tropical fish", keywords: "snorkel diving reef sea" },
      { char: "🌊", name: "wave", keywords: "sea ocean surf swim" },
      { char: "☀️", name: "sun", keywords: "sun sunny weather hot" },
      { char: "🌡️", name: "thermometer", keywords: "temperature weather heat" },
      { char: "📍", name: "pin", keywords: "location place where address" },
    ],
  },
  {
    label: "Occasions",
    emoji: [
      { char: "🎉", name: "party", keywords: "celebrate congratulations party news" },
      { char: "🥂", name: "champagne", keywords: "celebrate anniversary honeymoon toast" },
      { char: "🎂", name: "cake", keywords: "birthday celebration" },
      { char: "💍", name: "ring", keywords: "engagement wedding honeymoon proposal" },
      { char: "❤️", name: "heart", keywords: "love honeymoon romantic anniversary" },
      { char: "🎁", name: "gift", keywords: "gift present surprise treat" },
      { char: "🎄", name: "christmas tree", keywords: "christmas festive winter" },
      { char: "👨‍👩‍👧‍👦", name: "family", keywords: "family children kids together" },
    ],
  },
  {
    label: "Everyday",
    emoji: [
      { char: "👍", name: "thumbs up", keywords: "yes good agreed ok confirm" },
      { char: "🙏", name: "thanks", keywords: "thanks thank you please grateful" },
      { char: "😊", name: "smile", keywords: "smile happy friendly pleased" },
      { char: "😀", name: "grin", keywords: "happy grin pleased" },
      { char: "🙂", name: "slight smile", keywords: "smile polite friendly" },
      { char: "😅", name: "relief", keywords: "phew relief awkward sorry" },
      { char: "🤔", name: "thinking", keywords: "thinking question unsure wondering" },
      { char: "👏", name: "clap", keywords: "well done congratulations applause" },
      { char: "✅", name: "tick", keywords: "done confirmed booked complete yes" },
      { char: "❌", name: "cross", keywords: "no not available cancelled" },
      { char: "⚠️", name: "warning", keywords: "warning careful important note" },
      { char: "⏰", name: "clock", keywords: "time deadline reminder urgent" },
      { char: "📅", name: "calendar", keywords: "date dates diary booking when" },
      { char: "📞", name: "phone", keywords: "call phone ring speak" },
      { char: "📧", name: "email", keywords: "email message send" },
      { char: "💷", name: "pound", keywords: "price cost money payment deposit" },
      { char: "💡", name: "idea", keywords: "idea tip suggestion" },
      { char: "📎", name: "paperclip", keywords: "attached attachment file document" },
      { char: "⭐", name: "star", keywords: "star rating favourite recommended" },
      { char: "🔗", name: "link", keywords: "link url website" },
    ],
  },
];

export const ALL_EMOJI: Emoji[] = EMOJI_GROUPS.flatMap((g) => g.emoji);

/**
 * Search by name or keyword. An empty query returns nothing rather than
 * everything, because the groups are what you browse and this is what you
 * use when you already know the word.
 */
export function searchEmoji(query: string): Emoji[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_EMOJI.filter(
    (e) => e.name.includes(q) || e.keywords.split(" ").some((k) => k.startsWith(q))
  ).slice(0, 24);
}
