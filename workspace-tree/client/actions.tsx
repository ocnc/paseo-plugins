/**
 * The right side of a workspace row, matching Paseo's default sidebar: the diff stat at rest,
 * and on hover a one-click archive button and a ⋮ menu. Touch layouts show the controls all the
 * time because there is no hover.
 */
import {
  usePaseo,
  useWorkspace,
  type PluginSidebarViewProps,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { copyText, Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useState } from "react";
import { shades } from "./colors";
import { Pressable, Text, View } from "react-native";

type Colors = PluginSidebarViewProps["theme"]["colors"];

const ARCHIVE_CONFIRM_MS = 3000;

/** 204913 → "205k", 15642 → "15.6k": large diffs otherwise crowd out the title. */
function compact(value: number): string {
  if (value < 10_000) return String(value);
  return `${(value / 1000).toFixed(value < 100_000 ? 1 : 0)}k`;
}
const ICON = 13;

function IconButton({
  name,
  label,
  color,
  hoverColor,
  onPress,
  onHover,
}: {
  name: string;
  label: string;
  color: string;
  hoverColor: string;
  onPress: () => void;
  /** Tells the row the pointer is on a button, so the buttons stay put while it is. */
  onHover: (hovered: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => {
        setHovered(true);
        onHover(true);
      }}
      onHoverOut={() => {
        setHovered(false);
        onHover(false);
      }}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 22,
        height: 22,
        backgroundColor: hovered ? hoverColor : undefined,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={name} size={ICON} color={color} />
    </Pressable>
  );
}

function MenuItem({
  icon,
  label,
  colors,
  danger = false,
  onPress,
}: {
  icon: string;
  label: string;
  colors: Colors;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? colors.statusDanger : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: pressed ? shades(colors.foreground).pressed : undefined,
      })}
    >
      <Icon name={icon} size={ICON} color={danger ? colors.statusDanger : colors.foregroundMuted} />
      <Text style={{ color, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function RowActions({
  reference,
  colors,
  showControls,
  inline,
  onMove,
}: {
  reference: WorkspaceRef;
  colors: Colors;
  /** Hovered on a pointer layout. */
  showControls: boolean;
  /** Touch layouts have no hover, so the controls sit in the row permanently instead of floating. */
  inline: boolean;
  onMove: () => void;
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const info = useWorkspace(reference, (workspace) => ({
    title: workspace.title ?? workspace.name,
    branch: workspace.branch,
    directory: workspace.directory,
    pinned: !!workspace.pinnedAt,
    additions: workspace.diffStat?.additions ?? null,
    deletions: workspace.diffStat?.deletions ?? null,
  }));
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [onButtons, setOnButtons] = useState(false);

  useEffect(() => {
    if (!confirmArchive) return;
    const timer = setTimeout(() => setConfirmArchive(false), ARCHIVE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmArchive]);

  const handle = useCallback(() => paseo.workspaces.ref(reference), [paseo, reference]);
  const attempt = useCallback(
    async (action: () => Promise<unknown>, failure: string, success?: string) => {
      try {
        await action();
        if (success) toast.show(success, { variant: "success" });
      } catch (error) {
        toast.error(`${failure}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [toast],
  );

  const archive = useCallback(() => {
    setMenuOpen(false);
    setConfirmArchive(false);
    void attempt(() => handle().archive(), "Could not archive", `Archived ${info?.title ?? "workspace"}`);
  }, [attempt, handle, info?.title]);
  // One click arms it, a second within a few seconds archives, so a stray click costs nothing.
  const archiveButton = useCallback(() => {
    if (confirmArchive) archive();
    else setConfirmArchive(true);
  }, [confirmArchive, archive]);

  const closeMenu = useCallback((open: boolean) => {
    setMenuOpen(open);
    if (!open) {
      setRenaming(null);
      setConfirmArchive(false);
    }
  }, []);

  if (!info) return null;

  const saveRename = () => {
    const title = renaming?.trim();
    setMenuOpen(false);
    setRenaming(null);
    if (title && title !== info.title) void attempt(() => handle().setTitle(title), "Could not rename");
  };
  const copy = (text: string | null, what: string) => {
    setMenuOpen(false);
    if (text) void attempt(() => copyText(text), `Could not copy ${what}`, `Copied ${what}`);
  };

  const controlsVisible = showControls || menuOpen || onButtons;
  const diff =
    info.additions !== null && (info.additions > 0 || (info.deletions ?? 0) > 0)
      ? { additions: compact(info.additions), deletions: compact(info.deletions ?? 0) }
      : null;
  const controls = (
    <>
      {confirmArchive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Confirm archive ${info.title}`}
          onPress={archiveButton}
          onHoverIn={() => setOnButtons(true)}
          onHoverOut={() => setOnButtons(false)}
          hitSlop={4}
          style={{ paddingHorizontal: 4, height: 22, justifyContent: "center", borderRadius: 4 }}
        >
          <Text style={{ color: colors.statusDanger, fontSize: 11 }}>Archive?</Text>
        </Pressable>
      ) : (
        <IconButton
          name="Archive"
          label={`Archive ${info.title}`}
          color={colors.foregroundMuted}
          hoverColor={shades(colors.foreground).button}
          onPress={archiveButton}
          onHover={setOnButtons}
        />
      )}
      <IconButton
        name="MoreVertical"
        label={`More actions for ${info.title}`}
        color={colors.foregroundMuted}
        hoverColor={shades(colors.foreground).button}
        onPress={() => setMenuOpen(true)}
        onHover={setOnButtons}
      />
    </>
  );

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 18, marginTop: 4 }}>
      {inline ? controls : (
        // The diff stat always holds the slot's width, and the controls float over it on hover.
        // Swapping one for the other changed the title's width, which rewrapped the PR chips under
        // the pointer and made hover flicker on and off.
        // Always at least as wide as the two buttons, so they never sit over the title and need
        // no opaque backing (which cannot match an unknown sidebar color).
        <View style={{ position: "relative", minHeight: 18, minWidth: 46, alignItems: "flex-end", justifyContent: "center" }}>
          {diff ? (
            <Text style={{ fontSize: 11, lineHeight: 18, opacity: controlsVisible ? 0 : 1 }}>
              <Text style={{ color: colors.statusSuccess }}>+{diff.additions}</Text>{" "}
              <Text style={{ color: colors.statusDanger }}>−{diff.deletions}</Text>
            </Text>
          ) : null}
          {controlsVisible ? (
            <View
              style={{
                position: "absolute",
                right: 0,
                top: -2,
                height: 22,
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
                paddingLeft: 6,
              }}
            >
              {controls}
            </View>
          ) : null}
        </View>
      )}

      <Modal title={info.title} open={menuOpen} onOpenChange={closeMenu}>
        <Modal.Content contentContainerStyle={{ padding: 8, gap: 0 }}>
          {renaming !== null ? (
            <View style={{ padding: 8, gap: 8 }}>
              <TextInput
                autoFocus
                defaultValue={renaming}
                onChangeText={setRenaming}
                onSubmitEditing={saveRename}
                selectTextOnFocus
                style={{
                  color: colors.foreground,
                  fontSize: 13,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
                <MenuItem icon="X" label="Cancel" colors={colors} onPress={() => setRenaming(null)} />
                <MenuItem icon="Check" label="Save" colors={colors} onPress={saveRename} />
              </View>
            </View>
          ) : (
            <>
              <MenuItem icon="Pencil" label="Rename" colors={colors} onPress={() => setRenaming(info.title)} />
              <MenuItem
                icon={info.pinned ? "PinOff" : "Pin"}
                label={info.pinned ? "Unpin" : "Pin"}
                colors={colors}
                onPress={() => {
                  setMenuOpen(false);
                  void attempt(() => handle().setPinned(!info.pinned), "Could not update pin");
                }}
              />
              <MenuItem
                icon="FolderTree"
                label="Move…"
                colors={colors}
                onPress={() => {
                  setMenuOpen(false);
                  onMove();
                }}
              />
              {info.branch ? (
                <MenuItem icon="GitBranch" label="Copy branch name" colors={colors} onPress={() => copy(info.branch, "branch name")} />
              ) : null}
              {info.directory ? (
                <MenuItem icon="Copy" label="Copy path" colors={colors} onPress={() => copy(info.directory, "path")} />
              ) : null}
              {confirmArchive ? (
                <MenuItem icon="Archive" label="Confirm archive" colors={colors} danger onPress={archive} />
              ) : (
                <MenuItem icon="Archive" label="Archive" colors={colors} danger onPress={() => setConfirmArchive(true)} />
              )}
            </>
          )}
        </Modal.Content>
      </Modal>
    </View>
  );
}
