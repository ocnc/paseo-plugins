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
import { Pressable, Text, View } from "react-native";

type Colors = PluginSidebarViewProps["theme"]["colors"];

const ARCHIVE_CONFIRM_MS = 3000;
const ICON = 13;

function IconButton({
  name,
  label,
  color,
  onPress,
}: {
  name: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 18,
        height: 18,
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
        backgroundColor: pressed ? colors.surface2 : undefined,
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
  onMove,
}: {
  reference: WorkspaceRef;
  colors: Colors;
  /** Hovered on a pointer layout, or always on touch. */
  showControls: boolean;
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

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 18, marginTop: 4 }}>
      {showControls || menuOpen ? (
        <>
          {confirmArchive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Confirm archive ${info.title}`}
              onPress={archiveButton}
              hitSlop={4}
              style={{ paddingHorizontal: 4, height: 18, justifyContent: "center", borderRadius: 4 }}
            >
              <Text style={{ color: colors.statusDanger, fontSize: 11 }}>Archive?</Text>
            </Pressable>
          ) : (
            <IconButton
              name="Archive"
              label={`Archive ${info.title}`}
              color={colors.foregroundMuted}
              onPress={archiveButton}
            />
          )}
          <IconButton
            name="MoreVertical"
            label={`More actions for ${info.title}`}
            color={colors.foregroundMuted}
            onPress={() => setMenuOpen(true)}
          />
        </>
      ) : info.additions !== null && (info.additions > 0 || (info.deletions ?? 0) > 0) ? (
        <Text style={{ fontSize: 11, lineHeight: 18 }}>
          <Text style={{ color: colors.statusSuccess }}>+{info.additions}</Text>{" "}
          <Text style={{ color: colors.statusDanger }}>−{info.deletions}</Text>
        </Text>
      ) : null}

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
