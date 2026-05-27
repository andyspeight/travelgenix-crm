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

export const TOOLS: QueryTool[] = [
  tripsDeparting,
  tripsByDestination,
  revenueForPeriod,
];

export function findTool(name: string): QueryTool | undefined {
  return TOOLS.find((t) => t.name === name);
}
