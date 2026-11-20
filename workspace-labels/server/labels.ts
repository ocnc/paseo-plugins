/**
 * Workspace label access for agent tools, through the plugin SDK's Paseo API (0.16+).
 *
 * The SDK assigns labels by name only: an existing label keeps its color, and a new one is created
 * with Paseo's default color. It has no label catalog call, so `listLabelNames` collects the names
 * assigned to workspaces; a label no workspace carries is not listed.
 */
import type { PaseoApi } from "@getpaseo/client";

const PAGE_SIZE = 200;

/** Label names in use on any workspace, sorted case-insensitively and deduplicated by case. */
export async function listLabelNames(paseo: PaseoApi): Promise<string[]> {
  const names = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const result = await paseo.workspaces.list({
      filter: { includeBackground: true },
      page: { limit: PAGE_SIZE, cursor },
    });
    for (const workspace of result.entries) {
      for (const name of workspace.labels ?? []) {
        const key = name.toLowerCase();
        if (!names.has(key)) names.set(key, name);
      }
    }
    cursor = result.pageInfo.hasMore ? (result.pageInfo.nextCursor ?? undefined) : undefined;
  } while (cursor);
  return [...names.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Adds or removes one label on a workspace and returns the workspace's labels afterwards. */
export async function setLabel(
  paseo: PaseoApi,
  options: { workspaceId: string; name: string; assigned: boolean },
): Promise<string[]> {
  const result = await paseo.workspaces
    .ref(options.workspaceId)
    .setLabel(options.name, { assigned: options.assigned });
  return result.labels;
}
