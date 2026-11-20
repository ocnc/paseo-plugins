import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listWorkspacePullRequests } from "./server/prs";
import { treeParents } from "./shared/preferences";
import { workspacePullRequests } from "./shared/prs";

export default function contribute(server: PluginServerContext) {
  // Host-scoped settings are stored by the daemon; registering makes the document available.
  server.registerSettings(treeParents);
  server.handle(workspacePullRequests, ({ refresh }, { paseo }) =>
    listWorkspacePullRequests(paseo, refresh),
  );
  return () => {};
}
