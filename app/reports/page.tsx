import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";
import { ChartIcon } from "@/components/ui/icons";

export default function ReportsPage() {
  return (
    <>
      <Topbar title="Reports" />
      <ComingSoon
        Icon={ChartIcon}
        title="Reports land on day 7"
        description="Revenue by destination, cohort retention, pipeline by stage, source attribution, journey performance, supplier mix."
        day={7}
      />
    </>
  );
}
