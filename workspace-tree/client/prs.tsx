import { openExternalUrl, useRpc, type PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { mergedColor, shades } from "./colors";
import { workspacePullRequests, type PullRequest } from "../shared/prs";

type Colors = PluginSidebarViewProps["theme"]["colors"];

const VISIBLE = 3;
const REFRESH_MS = 60_000;

/** One shared query for every row; the plugin's query client is shared across its components. */
export function usePullRequests() {
  const list = useRpc(workspacePullRequests);
  return useQuery({
    queryKey: ["workspace-tree", "pull-requests"],
    queryFn: () => list({ refresh: false }),
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  });
}

function stateIcon(pr: PullRequest): string {
  if (pr.state === "merged") return "GitMerge";
  if (pr.state === "closed") return "GitPullRequestClosed";
  return pr.draft ? "GitPullRequestDraft" : "GitPullRequest";
}

/**
 * Paseo's default sidebar colors: open green, merged purple, closed red. The plugin theme has no
 * merged token, so this uses Paseo's own statusMerged values for light and dark backgrounds.
 */
function stateColor(pr: PullRequest, colors: Colors): string {
  if (pr.state === "merged") return mergedColor(colors.surface0);
  if (pr.state === "closed") return colors.statusDanger;
  return pr.draft ? colors.foregroundMuted : colors.statusSuccess;
}

const STATE_WORD: Record<PullRequest["state"], string> = { open: "", merged: " Merged", closed: " Closed" };

function checksIcon(pr: PullRequest, colors: Colors): { name: string; color: string; label: string } | null {
  if (pr.state !== "open") return null;
  if (pr.conflicting) return { name: "TriangleAlert", color: colors.statusWarning, label: "merge conflicts" };
  switch (pr.checks) {
    case "failure":
      return { name: "X", color: colors.statusDanger, label: "checks failing" };
    case "pending":
      return { name: "Clock", color: colors.statusWarning, label: "checks running" };
    case "success":
      return { name: "Check", color: colors.statusSuccess, label: "checks passed" };
    default:
      return null;
  }
}

function describe(pr: PullRequest, checks: { label: string } | null): string {
  const parts = [`Pull request ${pr.number}`, pr.title, pr.draft ? "draft" : pr.state];
  if (checks) parts.push(checks.label);
  if (pr.review === "approved") parts.push("approved");
  if (pr.review === "changes_requested") parts.push("changes requested");
  return parts.join(", ");
}

const Chip = memo(function Chip({ pr, colors }: { pr: PullRequest; colors: Colors }) {
  const open = useCallback(() => void openExternalUrl(pr.url), [pr.url]);
  const [hovered, setHovered] = useState(false);
  const checks = checksIcon(pr, colors);
  const done = pr.state !== "open";
  const color = done ? colors.foregroundMuted : colors.foreground;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={describe(pr, checks)}
      onPress={open}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hitSlop={4}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
        borderWidth: pr.current ? 1 : 0,
        borderColor: shades(colors.foreground).lineStrong,
        backgroundColor: pressed ? shades(colors.foreground).pressed : undefined,
        opacity: pr.state === "closed" && !hovered ? 0.7 : 1,
      })}
    >
      {/* Like the default sidebar, hovering swaps the state icon for an external-link arrow. */}
      <Icon
        name={hovered ? "ExternalLink" : stateIcon(pr)}
        size={11}
        color={hovered ? colors.foreground : stateColor(pr, colors)}
      />
      <Text style={{ color: hovered ? colors.foreground : color, fontSize: 11, lineHeight: 14 }}>
        #{pr.number}
        {STATE_WORD[pr.state]}
      </Text>
      {checks ? <Icon name={checks.name} size={11} color={checks.color} /> : null}
      {pr.review === "approved" && !done ? (
        <Icon name="ThumbsUp" size={10} color={colors.statusSuccess} />
      ) : null}
    </Pressable>
  );
});

/** Every PR the workspace opened, current branch first, then open, then newest. */
export function PullRequestLine({ workspaceId, colors }: { workspaceId: string; colors: Colors }) {
  const { data } = usePullRequests();
  const prs = data?.workspaces[workspaceId];
  if (!prs?.length) return null;
  const extra = prs.length - VISIBLE;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2, marginLeft: -4 }}>
      {prs.slice(0, VISIBLE).map((pr) => (
        <Chip key={pr.number} pr={pr} colors={colors} />
      ))}
      {extra > 0 ? (
        <Text
          accessibilityLabel={`${extra} more pull requests`}
          style={{ color: colors.foregroundMuted, fontSize: 11, paddingHorizontal: 2 }}
        >
          +{extra}
        </Text>
      ) : null}
    </View>
  );
}
