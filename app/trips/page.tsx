import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";
import { PlaneIcon } from "@/components/ui/icons";

export default function TripsPage() {
  return (
    <>
      <Topbar title="Trips" />
      <ComingSoon
        Icon={PlaneIcon}
        title="Trips lifecycle lands on day 4"
        description="Six-stage Kanban, per-card predictions, stage-health indicators, and the predictive 'will close this week' panel."
        day={4}
      />
    </>
  );
}
