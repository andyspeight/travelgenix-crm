import { Topbar } from "@/components/layout/topbar";
import { ComingSoon } from "@/components/ui/coming-soon";
import { SettingsIcon } from "@/components/ui/icons";

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" />
      <ComingSoon
        Icon={SettingsIcon}
        title="Settings lands on day 7"
        description="Workspace branding, team management, integrations, AI tone of voice, journey rules, compliance audit trail."
        day={7}
      />
    </>
  );
}
