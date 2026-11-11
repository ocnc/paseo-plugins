/**
 * Workspace label access for agent tools.
 *
 * Paseo 0.15's plugin SDK has no workspace-label call, so this opens its own daemon session the
 * way the CLI does (the daemon's local credential over its listen address). That client API is
 * not a plugin contract: pin @getpaseo/client to the daemon's version. On 0.16+, replace
 * `connect()` and these calls with `paseo.workspaces.ref(id).setLabel(...)`.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHostClient } from "@getpaseo/client/node";

type DaemonClient = ReturnType<typeof createHostClient>;

export const LABEL_COLORS = [
  "violet",
  "sky",
  "emerald",
  "orange",
  "pink",
  "indigo",
  "teal",
  "red",
  "amber",
  "blue",
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export interface Label {
  name: string;
  color: LabelColor;
}

/** Stable color for a new label, so the same name always gets the same color. */
export function colorFor(name: string): LabelColor {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return LABEL_COLORS[hash % LABEL_COLORS.length];
}

export class WorkspaceLabels {
  private readonly home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  private client: Promise<DaemonClient> | null = null;

  async list(): Promise<Label[]> {
    const client = await this.connect();
    return (await client.listWorkspaceLabels()).labels;
  }

  /**
   * Adds or removes one label on a workspace and returns the workspace's labels afterwards.
   * An existing label keeps its color unless `color` is given; a new one is created on first use.
   */
  async set(options: {
    workspaceId: string;
    name: string;
    assigned: boolean;
    color?: LabelColor;
  }): Promise<string[]> {
    const client = await this.connect();
    const existing = (await client.listWorkspaceLabels()).labels.find(
      (label) => label.name.toLowerCase() === options.name.toLowerCase(),
    );
    const name = existing?.name ?? options.name;
    const color = options.color ?? existing?.color ?? colorFor(name);
    const result = await client.setWorkspaceLabel({
      workspaceId: options.workspaceId,
      label: { name, color },
      assigned: options.assigned,
    });
    return result.workspaceLabels;
  }

  async close(): Promise<void> {
    const pending = this.client;
    this.client = null;
    await (await pending?.catch(() => null))?.close();
  }

  private connect(): Promise<DaemonClient> {
    this.client ??= this.open().catch((error: unknown) => {
      this.client = null;
      throw error;
    });
    return this.client;
  }

  private async open(): Promise<DaemonClient> {
    const { listen } = JSON.parse(readFileSync(join(this.home, "paseo.pid"), "utf8")) as {
      listen: string;
    };
    const client = createHostClient(listen, {
      clientId: "paseo-workspace-labels",
      clientType: "cli",
      appVersion: "0.15.4",
      localCredential: () => readFileSync(join(this.home, "local-credential"), "utf8").trim(),
      reconnect: { enabled: true },
    });
    try {
      await client.connect();
    } catch (error) {
      await client.close();
      throw error;
    }
    return client;
  }
}
