/** Gives every agent tools to read and set labels on its workspace (or another workspace). */
import { z } from "zod";
import { defineAgentTool, type PluginServerContext } from "@getpaseo/plugin/server";
import { LABEL_COLORS, WorkspaceLabels } from "./server/labels";

export default function contribute(server: PluginServerContext) {
  const labels = new WorkspaceLabels();

  const listTool = defineAgentTool({
    name: "list_workspace_labels",
    description:
      "List the workspace labels that already exist in Paseo, with their colors. Check this before " +
      "labeling so you reuse an existing label name instead of creating a near-duplicate.",
    input: z.object({}),
    async execute() {
      const all = await labels.list();
      return {
        text: all.length
          ? all.map((label) => `${label.name} (${label.color})`).join("\n")
          : "No workspace labels exist yet.",
        structuredContent: { labels: all },
      };
    },
  });

  const setTool = defineAgentTool({
    name: "set_workspace_label",
    description:
      "Add or remove a label on a Paseo workspace (the label chips in the Paseo sidebar). Defaults " +
      "to your own workspace. Creates the label if it does not exist. Use this when the user asks " +
      "you to label, tag, or categorize the workspace; agent labels are a different thing.",
    input: z.object({
      name: z.string().trim().min(1).describe("Label name, e.g. 'Needs review'"),
      assigned: z
        .boolean()
        .default(true)
        .describe("true adds the label, false removes it from the workspace"),
      color: z
        .enum(LABEL_COLORS)
        .optional()
        .describe("Only for a new label or to recolor one; omit to keep the existing color"),
      workspaceId: z
        .string()
        .optional()
        .describe("Another workspace's ID; omit to label your own workspace"),
    }),
    async execute({ name, assigned, color, workspaceId }, { agent }) {
      const target = workspaceId ?? agent.workspaceId;
      if (!target) {
        return { isError: true, text: "This agent has no workspace; pass workspaceId." };
      }
      const current = await labels.set({ workspaceId: target, name, assigned, color });
      return {
        text: `${assigned ? "Added" : "Removed"} "${name}". Workspace labels now: ${
          current.length ? current.join(", ") : "none"
        }`,
        structuredContent: { workspaceId: target, labels: current },
      };
    },
  });

  server.addHook("agent.open.before", async ({ request }) => ({
    ...request,
    tools: [...request.tools, listTool, setTool],
  }));

  return () => labels.close();
}
