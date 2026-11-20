/**
 * Maps each workspace to the workspace it was spawned from.
 *
 * View snapshots expose only `parentAgent`, but the daemon's workspace descriptor keeps
 * `parentWorkspaceId`, which survives the parent agent being archived. Read it from each online
 * host and re-read when a workspace appears that the map has not seen yet. The field never
 * changes after creation, so there is nothing else to follow.
 */
import { getPaseoClient, useHosts, type WorkspaceRef } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 200;

export function nodeKey(hostId: string, workspaceId: string): string {
  return `${hostId}/${workspaceId}`;
}

async function readParents(hostId: string): Promise<Map<string, string | null>> {
  const paseo = getPaseoClient(hostId);
  const parents = new Map<string, string | null>();
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({
      filter: { includeBackground: true },
      page: { limit: PAGE_SIZE, cursor },
    });
    for (const workspace of page.entries) {
      parents.set(
        nodeKey(hostId, workspace.id),
        workspace.parentWorkspaceId ? nodeKey(hostId, workspace.parentWorkspaceId) : null,
      );
    }
    cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
  } while (cursor);
  return parents;
}

/** Parent node key for every known workspace node key; null for a workspace with no parent. */
export function useParents(workspaces: readonly WorkspaceRef[]): ReadonlyMap<string, string | null> {
  const hosts = useHosts();
  const [parents, setParents] = useState<ReadonlyMap<string, string | null>>(new Map());

  const onlineHosts = useMemo(
    () =>
      hosts
        .filter((host) => host.status === "online")
        .map((host) => host.serverId)
        .join(","),
    [hosts],
  );
  // Only hosts with a workspace the map has not read need a fetch.
  const staleHosts = useMemo(() => {
    const online = new Set(onlineHosts ? onlineHosts.split(",") : []);
    const stale = new Set<string>();
    for (const ref of workspaces) {
      if (online.has(ref.hostId) && !parents.has(nodeKey(ref.hostId, ref.id))) {
        stale.add(ref.hostId);
      }
    }
    return [...stale].sort().join(",");
  }, [workspaces, parents, onlineHosts]);

  useEffect(() => {
    if (!staleHosts) return;
    let cancelled = false;
    void Promise.all(
      staleHosts.split(",").map((hostId) =>
        readParents(hostId).catch((error) => {
          console.error(`[workspace-tree] Could not read workspaces on ${hostId}`, error);
          return new Map<string, string | null>();
        }),
      ),
    ).then((results) => {
      if (cancelled) return;
      setParents((previous) => {
        const next = new Map(previous);
        for (const result of results) for (const [key, parent] of result) next.set(key, parent);
        // A workspace the daemon did not return is recorded as a root so it is not refetched.
        for (const ref of workspaces) {
          const key = nodeKey(ref.hostId, ref.id);
          if (!next.has(key)) next.set(key, null);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [staleHosts, workspaces]);

  return parents;
}
