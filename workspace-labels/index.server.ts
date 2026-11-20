/** Gives every agent tools to read and set labels on its workspace (or another workspace). */
import { z } from "zod";
import { defineAgentTool, type PluginServerContext } from "@getpaseo/plugin/server";
import { listLabelNames, setLabel } from "./server/labels";

export default function contribute(server: PluginServerContext) {
  const listTool = defineAgentTool({
    name: "list_workspace_labels",
    description:
      "List the workspace label names currently in use in Paseo. Check this before labeling so " +
      "you reuse an existing label name instead of creating a near-duplicate.",
    input: z.object({}),
    async execute(_input, { paseo }) {
      const names = await listLabelNames(paseo);
      return {
        text: names.length ? names.join("\n") : "No workspace labels are in use yet.",
        structuredContent: { labels: names },
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
      workspaceId: z
        .string()
        .optional()
        .describe("Another workspace's ID; omit to label your own workspace"),
    }),
    async execute({ name, assigned, workspaceId }, { agent, paseo }) {
      const target = workspaceId ?? agent.workspaceId;
      if (!target) {
        return { isError: true, text: "This agent has no workspace; pass workspaceId." };
      }
      const current = await setLabel(paseo, { workspaceId: target, name, assigned });
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

  return () => {};
}
