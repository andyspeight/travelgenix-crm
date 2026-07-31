/**
 * POST /api/sequences/install — put the starter quote chase in place.
 *
 * One sequence, because one good example teaches the shape better than five
 * half-relevant ones. The quote chase is the sequence with the clearest
 * revenue line: a quote that goes unanswered is already lost revenue, and the
 * rescue detector already knows which ones are dying.
 *
 * Installed PAUSED and in review mode. An agent turns it on once they have
 * read the wording, which is the right order — nobody should discover their
 * CRM chasing customers with words they have never seen.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STARTER = {
  name: "Quote chase",
  description:
    "Follows up a quote that has gone quiet — twice, politely — and stops the moment they reply or the quote is answered.",
  trigger_kind: "custom",
  trigger_config: { rule: "quote_unanswered", days: 3, min_value: 0 },
  steps: [
    {
      step_number: 1,
      delay_days: 0,
      subject: "Your quote — any questions?",
      body: `Hi {{name}},

I wanted to check the quote reached you, and see whether anything needs changing. Dates, room type, budget — all of it is easy to adjust while we're at this stage.

If it's easier to talk it through, just say and I'll call.`,
    },
    {
      step_number: 2,
      delay_days: 4,
      subject: "Still holding your quote",
      body: `Hi {{name}},

Just a quick note that I'm still holding the quote for you. Prices and availability can move at this time of year, so if you're keen I'd rather sort it sooner than later.

And if plans have changed, do tell me — I'd rather know than keep chasing.`,
    },
    {
      step_number: 3,
      delay_days: 10,
      subject: "Shall I close this off?",
      body: `Hi {{name}},

I haven't heard back, so I'll assume the timing isn't right and stop bothering you.

If anything changes, or you'd like me to look at something completely different, I'm here.`,
    },
  ],
};

export async function POST() {
  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const { data: existing } = await supabase
    .from("sequences")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("name", STARTER.name)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, alreadyInstalled: true, id: existing.id });
  }

  const { data: seq, error } = await supabase
    .from("sequences")
    .insert({
      agency_id: agencyId,
      name: STARTER.name,
      description: STARTER.description,
      trigger_kind: STARTER.trigger_kind,
      trigger_config: STARTER.trigger_config,
      auto_send: false, // review mode until an agent decides otherwise
      is_active: false, // and paused until they have read it
    })
    .select("id")
    .maybeSingle();

  if (error || !seq) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Could not create the sequence." },
      { status: 500 }
    );
  }

  const { error: stepErr } = await supabase.from("sequence_steps").insert(
    STARTER.steps.map((s) => ({ ...s, sequence_id: seq.id }))
  );
  if (stepErr) {
    return NextResponse.json({ ok: false, error: stepErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: seq.id, steps: STARTER.steps.length });
}
