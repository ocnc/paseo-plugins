import type { WorkspaceIndicator } from "@getpaseo/plugin";
import {
  useSettings,
  useWorkspace,
  useWorkspaces,
  type Group,
  type PluginSidebarViewProps,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { treeLayout, treeParents } from "../shared/preferences";
import {
  DragController,
  useDragHandlers,
  useDragState,
  useRowDragState,
  type DropTarget,
} from "./drag";
import { nodeKey, useParents } from "./parents";
import { RowActions } from "./actions";
import { PullRequestLine } from "./prs";

// macOS / VS Code sidebar sizing: 13pt titles on an 18pt line, 11pt secondary text and headings.
const INDENT = 14;
const ROW_HEIGHT = 26;
const TITLE_SIZE = 13;
const TITLE_LINE = 18;
/** Box matching the title's first line (4pt padding + 18pt line), for items that sit beside it. */
const titleLine = { height: TITLE_LINE, marginTop: 4, justifyContent: "center", alignItems: "center" } as const;
const projectKey = (groupKey: string) => `project:${groupKey}`;

type Colors = PluginSidebarViewProps["theme"]["colors"];

interface TreeNode {
  key: string;
  ref: WorkspaceRef;
  children: TreeNode[];
}

interface Placement {
  ref: WorkspaceRef;
  project: string;
  /** Parent as drawn: null when the workspace sits at the top level of its project. */
  parent: string | null;
}

/** Nests a project's workspaces under their parents. A parent outside the list makes a root. */
function buildForest(
  refs: readonly WorkspaceRef[],
  parents: ReadonlyMap<string, string | null>,
): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const ref of refs) {
    const key = nodeKey(ref.hostId, ref.id);
    nodes.set(key, { key, ref, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(parents.get(node.key) ?? "");
    if (parent && !isAncestor(node.key, parent.key, parents)) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** True when `candidate` is `of` or one of its ancestors. Stops on a loop in stored data. */
function isAncestor(
  candidate: string,
  of: string,
  parents: ReadonlyMap<string, string | null>,
): boolean {
  const seen = new Set<string>();
  for (let key: string | null | undefined = of; key; key = parents.get(key)) {
    if (key === candidate) return true;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return false;
}

function place(nodes: TreeNode[], project: string, parent: string | null, out: Map<string, Placement>) {
  for (const node of nodes) {
    out.set(node.key, { ref: node.ref, project, parent });
    place(node.children, project, node.key, out);
  }
}

function countDescendants(node: TreeNode): number {
  return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
}

function indicatorColor(indicator: WorkspaceIndicator, colors: Colors): string | null {
  switch (indicator) {
    case "running":
      return colors.accent;
    case "needs_input":
      return colors.statusWarning;
    case "attention":
      return colors.statusSuccess;
    case "failed":
      return colors.statusDanger;
    default:
      return null;
  }
}

interface Layout {
  collapsed: ReadonlySet<string>;
  toggle(key: string): void;
}

interface TreeContext {
  view: PluginSidebarViewProps;
  layout: Layout;
  controller: DragController;
  dragEnabled: boolean;
}

function Chevron({
  open,
  label,
  onPress,
  color,
}: {
  open: boolean | null;
  label: string;
  onPress?: () => void;
  color: string;
}) {
  if (open === null) return <View style={{ ...titleLine, width: 16 }} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${open ? "Collapse" : "Expand"} ${label}`}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      hitSlop={6}
      style={{ ...titleLine, width: 16 }}
    >
      <Text style={{ color, fontSize: 10 }}>{open ? "▾" : "▸"}</Text>
    </Pressable>
  );
}

/** Accent line showing where a "before" or "after" drop lands. */
function InsertLine({ edge, left, color }: { edge: "top" | "bottom"; left: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left, right: 8, height: 2, [edge]: -1, backgroundColor: color }}
    />
  );
}

const WorkspaceNode = memo(function WorkspaceNode({
  node,
  depth,
  context,
}: {
  node: TreeNode;
  depth: number;
  context: TreeContext;
}) {
  const { view, layout, controller, dragEnabled } = context;
  const { colors } = view.theme;
  const row = useWorkspace(node.ref, (workspace) => ({
    label: workspace.title ?? workspace.name,
    indicator: workspace.indicator,
    indicatorLabel: workspace.indicatorLabel,
  }));
  const drag = useRowDragState(controller, node.key);
  const handlers = useDragHandlers(controller, node.key, dragEnabled);
  const register = useCallback(
    (element: View | null) => controller.register(node.key, "workspace", element),
    [controller, node.key],
  );
  const hasChildren = node.children.length > 0;
  const open = hasChildren ? !layout.collapsed.has(node.key) : null;
  const selected = view.active.workspace?.key === node.ref.key;
  const [hovered, setHovered] = useState(false);
  const hoverIn = useCallback(() => setHovered(true), []);
  const hoverOut = useCallback(() => setHovered(false), []);

  const press = useCallback(() => {
    if (drag.picking) {
      if (drag.isSource) controller.cancel();
      else controller.place({ key: node.key, mode: "inside" });
      return;
    }
    view.navigation.openWorkspace(node.ref);
  }, [drag.picking, drag.isSource, controller, node.key, node.ref, view.navigation]);
  const pick = useCallback(() => controller.pick(node.key), [controller, node.key]);
  const toggle = useCallback(() => layout.toggle(node.key), [layout, node.key]);

  if (!row) return null;
  const dot = indicatorColor(row.indicator, colors);
  const hidden = open === false ? countDescendants(node) : 0;
  const indent = 8 + depth * INDENT;
  const inside = drag.dropMode === "inside";

  return (
    <View>
      <View ref={register} {...handlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            drag.picking
              ? `Move into ${row.label}`
              : `Open ${row.label}${row.indicatorLabel ? `, ${row.indicatorLabel}` : ""}`
          }
          accessibilityHint="Long press to move this workspace"
          onPress={press}
          onLongPress={pick}
          onHoverIn={hoverIn}
          onHoverOut={hoverOut}
          style={({ pressed }) => ({
            minHeight: ROW_HEIGHT,
            flexDirection: "row",
            // Top-aligned so the chevron and dot sit on the title's line, not centered on the PR line.
            alignItems: "flex-start",
            gap: 8,
            paddingLeft: indent,
            paddingRight: 8,
            opacity: drag.isSource ? 0.45 : 1,
            borderWidth: 1,
            borderRadius: 4,
            borderColor: inside ? colors.accent : "transparent",
            backgroundColor:
              inside || selected ? colors.surface2 : pressed || hovered ? colors.surface1 : undefined,
          })}
        >
          <Chevron open={open} label={row.label} onPress={toggle} color={colors.foregroundMuted} />
          <View style={titleLine}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: dot ?? "transparent",
                borderWidth: dot ? 0 : 1,
                borderColor: colors.border,
              }}
            />
          </View>
          <View style={{ flex: 1, paddingVertical: 4, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.foreground, fontSize: TITLE_SIZE, lineHeight: TITLE_LINE }}
            >
              {row.label}
            </Text>
            <PullRequestLine workspaceId={node.ref.id} colors={colors} />
          </View>
          {hidden > 0 ? (
            <View style={titleLine}>
              <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{hidden}</Text>
            </View>
          ) : null}
          <RowActions
            reference={node.ref}
            colors={colors}
            showControls={hovered || view.layout.compact}
            onMove={pick}
          />
        </Pressable>
        {drag.dropMode === "before" ? (
          <InsertLine edge="top" left={indent} color={colors.accent} />
        ) : null}
        {drag.dropMode === "after" ? (
          <InsertLine edge="bottom" left={indent} color={colors.accent} />
        ) : null}
      </View>
      {open ? (
        <View>
          {/* Guide line linking children to their parent, like an editor's file tree. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: indent + 8,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: colors.border,
            }}
          />
          {node.children.map((child) => (
            <WorkspaceNode key={child.key} node={child} depth={depth + 1} context={context} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

function ProjectSection({
  group,
  forest,
  context,
}: {
  group: Group<WorkspaceRef>;
  forest: TreeNode[];
  context: TreeContext;
}) {
  const { view, layout, controller } = context;
  const { colors } = view.theme;
  const key = projectKey(group.key);
  const drag = useRowDragState(controller, key);
  const register = useCallback(
    (element: View | null) => controller.register(key, "project", element),
    [controller, key],
  );
  const open = !layout.collapsed.has(key);
  const title = group.title ?? "Workspaces";
  const press = useCallback(() => {
    if (drag.picking) controller.place({ key, mode: "top" });
    else layout.toggle(key);
  }, [drag.picking, controller, layout, key]);
  const target = drag.dropMode === "top";

  return (
    <View style={{ paddingBottom: 6 }}>
      <View ref={register}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            drag.picking ? `Move to the top level of ${title}` : `${open ? "Collapse" : "Expand"} ${title}`
          }
          accessibilityState={drag.picking ? undefined : { expanded: open }}
          onPress={press}
          style={{
            minHeight: ROW_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 8,
            marginTop: 6,
            borderWidth: 1,
            borderRadius: 4,
            borderColor: target ? colors.accent : "transparent",
            backgroundColor: target ? colors.surface2 : undefined,
          }}
        >
          <Text style={{ width: 16, textAlign: "center", color: colors.foregroundMuted, fontSize: 10 }}>
            {open ? "▾" : "▸"}
          </Text>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.foregroundMuted,
              fontSize: 11,
              fontWeight: "600",
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {title}
          </Text>
          {drag.picking ? (
            <Text style={{ color: colors.accent, fontSize: 11 }}>Top level</Text>
          ) : !open ? (
            <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{group.items.length}</Text>
          ) : null}
        </Pressable>
      </View>
      {open
        ? forest.map((node) => <WorkspaceNode key={node.key} node={node} depth={0} context={context} />)
        : null}
    </View>
  );
}

/** Shown while a picked workspace waits for a destination tap. */
function PickBanner({
  context,
  placements,
  overrides,
  restore,
}: {
  context: TreeContext;
  placements: ReadonlyMap<string, Placement>;
  overrides: Readonly<Record<string, string | null>> | null;
  restore: (key: string) => void;
}) {
  const state = useDragState(context.controller);
  const source = state.gesture === "pick" ? state.source : null;
  const ref = source ? placements.get(source)?.ref : undefined;
  if (!source || !ref) return null;
  return (
    <PickBannerBody
      context={context}
      source={source}
      reference={ref}
      moved={!!overrides && source in overrides}
      restore={restore}
    />
  );
}

function PickBannerBody({
  context,
  source,
  reference,
  moved,
  restore,
}: {
  context: TreeContext;
  source: string;
  reference: WorkspaceRef;
  moved: boolean;
  restore: (key: string) => void;
}) {
  const { controller, view } = context;
  const { colors } = view.theme;
  const name = useWorkspace(reference, (workspace) => workspace.title ?? workspace.name);
  const button = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, backgroundColor: colors.surface2 }}
    >
      <Text style={{ color: colors.foreground, fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View
      style={{
        margin: 8,
        padding: 8,
        gap: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.surface1,
      }}
    >
      <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 12 }}>
        Moving {name ?? "workspace"}
      </Text>
      <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
        Tap a workspace to nest it there, or a project heading to move it to the top level.
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {moved
          ? button("Restore original", () => {
              restore(source);
              controller.cancel();
            })
          : null}
        {button("Cancel", () => controller.cancel())}
      </View>
    </View>
  );
}

export function WorkspaceTree(view: PluginSidebarViewProps) {
  const layoutSettings = useSettings(treeLayout);
  const parentSettings = useSettings(treeParents);
  const controller = useRef(new DragController()).current;
  const groups = useWorkspaces({
    where: (workspace) => !workspace.background && !workspace.archivingAt,
    orderBy: ["createdAt", "desc"],
    groupBy: (workspace) => ({ key: workspace.project.key, title: workspace.projectDisplayName }),
  });
  const refs = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const recorded = useParents(refs);

  const overrides = parentSettings.status === "ready" ? parentSettings.values.overrides : null;
  const { forests, placements } = useMemo(() => {
    const effective = new Map(recorded);
    for (const [key, parent] of Object.entries(overrides ?? {})) effective.set(key, parent);
    const forests = new Map<string, TreeNode[]>();
    const placements = new Map<string, Placement>();
    for (const group of groups) {
      const forest = buildForest(group.items, effective);
      forests.set(group.key, forest);
      place(forest, projectKey(group.key), null, placements);
    }
    return { forests, placements };
  }, [groups, recorded, overrides]);

  // Read through refs so gesture handlers created once always see the current tree.
  const latest = useRef({ placements, recorded, parentSettings });
  latest.current = { placements, recorded, parentSettings };

  const saveParent = useCallback((source: string, parent: string | null | "recorded") => {
    const { recorded, parentSettings } = latest.current;
    if (parentSettings.status !== "ready") return;
    const next = { ...parentSettings.values.overrides };
    if (parent === "recorded" || parent === (recorded.get(source) ?? null)) delete next[source];
    else next[source] = parent;
    void parentSettings.save({ overrides: next }, parentSettings.revision);
  }, []);

  controller.policy = useMemo(
    () => ({
      resolve(source: string, target: DropTarget) {
        const { placements } = latest.current;
        const from = placements.get(source);
        if (!from) return undefined;
        let parent: string | null;
        if (target.mode === "top") {
          if (target.key !== from.project) return undefined;
          parent = null;
        } else {
          const to = placements.get(target.key);
          if (!to || to.project !== from.project) return undefined;
          parent = target.mode === "inside" ? target.key : to.parent;
        }
        if (parent === from.parent) return undefined;
        if (parent !== null) {
          // A workspace cannot move into itself or anything nested under it.
          for (let key: string | null = parent; key; key = placements.get(key)?.parent ?? null) {
            if (key === source) return undefined;
          }
        }
        return parent;
      },
      commit: saveParent,
    }),
    [saveParent],
  );

  const collapsedList = layoutSettings.status === "ready" ? layoutSettings.values.collapsed : null;
  const { save: saveLayout } = layoutSettings;
  const layoutRevision = layoutSettings.status === "ready" ? layoutSettings.revision : null;
  const layout = useMemo<Layout>(() => {
    const collapsed = new Set(collapsedList ?? []);
    return {
      collapsed,
      toggle(key) {
        if (layoutRevision === null) return;
        const next = new Set(collapsed);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        void saveLayout({ collapsed: [...next] }, layoutRevision);
      },
    };
  }, [collapsedList, layoutRevision, saveLayout]);

  const context = useMemo<TreeContext>(
    () => ({ view, layout, controller, dragEnabled: !view.layout.compact }),
    [view, layout, controller],
  );
  const restore = useCallback((key: string) => saveParent(key, "recorded"), [saveParent]);

  // Wait for saved state so folded folders and moved workspaces do not jump into place.
  if (layoutSettings.status === "loading" || parentSettings.status === "loading") return null;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 4 }}>
      <PickBanner context={context} placements={placements} overrides={overrides} restore={restore} />
      {parentSettings.saveError ? (
        <Text style={{ color: view.theme.colors.statusDanger, fontSize: 11, paddingHorizontal: 12 }}>
          Could not save the move: {parentSettings.saveError}
        </Text>
      ) : null}
      {groups.length === 0 ? (
        <Text style={{ color: view.theme.colors.foregroundMuted, fontSize: 12, padding: 12 }}>
          No workspaces yet.
        </Text>
      ) : null}
      {groups.map((group) => (
        <ProjectSection
          key={group.key}
          group={group}
          forest={forests.get(group.key) ?? []}
          context={context}
        />
      ))}
    </ScrollView>
  );
}
