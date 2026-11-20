import type { PluginClientContext } from "@getpaseo/plugin/client";
import { WorkspaceTree } from "./client/tree";

export default function contribute(client: PluginClientContext) {
  return client.addSidebarView({
    id: "tree",
    title: "Workspace tree",
    description: "Workspaces nested under the workspace that spawned them",
    Component: WorkspaceTree,
  });
}
