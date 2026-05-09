import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";
import { InboxIcon } from "@/components/ui/icons";

export default function InboxPage() {
  return (
    <>
      <Topbar title="Inbox" />
      <ComingSoon
        Icon={InboxIcon}
        title="Inbox lands on day 3"
        description="Triage banner, priority lanes, three ranked Luna drafts, and the mini customer card on the right."
        day={3}
      />
    </>
  );
}
