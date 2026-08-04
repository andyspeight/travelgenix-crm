/**
 * Tool registry. The single list of available Ask query tools. The router
 * reads this to build its tool menu for the model. Add new tools here only.
 *
 * When AI-SQL lands later, it registers here too as just another tool, so the
 * router and UI never need to change.
 */

import type { QueryTool } from "./contract";
import { tripsDeparting } from "./tools/trips-departing";
import { tripsByDestination } from "./tools/trips-by-destination";
import { revenueForPeriod } from "./tools/revenue-for-period";
import { tripsByStage } from "./tools/trips-by-stage";
import { customersByValueOrTag } from "./tools/customers-by-value-or-tag";
import { tripsRecentlyReturned } from "./tools/trips-recently-returned";
import { customerProfile } from "./tools/customer-profile";
import { businessReport } from "./tools/business-report";
import { customersGoneQuiet } from "./tools/customers-gone-quiet";
import { quotesAtRisk } from "./tools/quotes-at-risk";
import { passportStatus } from "./tools/passport-status";
import { openCases } from "./tools/open-cases";
import { enquiriesAwaitingResponse } from "./tools/enquiries-awaiting-response";
import { tasksDue } from "./tools/tasks-due";
import { currentlyTravelling } from "./tools/currently-travelling";
import { marketingReach } from "./tools/marketing-reach";
import { rebookingDue } from "./tools/rebooking-due";
import { upcomingBirthdays } from "./tools/upcoming-birthdays";
import { dietaryAndFlags } from "./tools/dietary-and-flags";
import { dataQuality } from "./tools/data-quality";
import { commissionOutstanding } from "./tools/commission-outstanding";

export const TOOLS: QueryTool[] = [
  tripsDeparting,
  tripsByDestination,
  revenueForPeriod,
  tripsByStage,
  customersByValueOrTag,
  tripsRecentlyReturned,
  customerProfile,
  businessReport,
  customersGoneQuiet,
  quotesAtRisk,
  passportStatus,
  openCases,
  enquiriesAwaitingResponse,
  tasksDue,
  currentlyTravelling,
  marketingReach,
  rebookingDue,
  upcomingBirthdays,
  dietaryAndFlags,
  dataQuality,
  commissionOutstanding,
];

export function findTool(name: string): QueryTool | undefined {
  return TOOLS.find((t) => t.name === name);
}
