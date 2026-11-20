/**
 * Moving workspaces between parents, like dragging files in an editor's tree.
 *
 * Two gestures share one store:
 * - Drag (desktop): press a row and move the pointer. Rows are measured when the drag starts, and
 *   the row under the pointer decides the drop: its middle nests inside it, its top or bottom edge
 *   places beside it, and a project heading moves to the top level.
 * - Pick (touch, and anywhere by long press): the picked row waits for a tap on a destination.
 *
 * The store lives outside React state so a pointer move re-renders only the rows whose highlight
 * changes.
 */
import { useMemo, useRef, useSyncExternalStore } from "react";
import { PanResponder, type View } from "react-native";

export type DropMode = "inside" | "before" | "after" | "top";

export interface DropTarget {
  key: string;
  mode: DropMode;
}

interface Rect {
  key: string;
  kind: "workspace" | "project";
  top: number;
  bottom: number;
}

interface DragState {
  source: string | null;
  gesture: "drag" | "pick" | null;
  target: DropTarget | null;
}

export interface DropPolicy {
  /** The parent a drop would assign, null for top level, or undefined when the drop is not allowed. */
  resolve(source: string, target: DropTarget): string | null | undefined;
  commit(source: string, parent: string | null): void;
}

const EDGE = 0.25;
const DRAG_THRESHOLD = 6;

export class DragController {
  private state: DragState = { source: null, gesture: null, target: null };
  private listeners = new Set<() => void>();
  private rows = new Map<string, { kind: Rect["kind"]; view: View | null }>();
  private rects: Rect[] = [];
  policy: DropPolicy | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get snapshot(): DragState {
    return this.state;
  }

  private set(next: Partial<DragState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  register(key: string, kind: Rect["kind"], view: View | null) {
    if (view) this.rows.set(key, { kind, view });
    else this.rows.delete(key);
  }

  beginDrag(source: string) {
    this.rects = [];
    this.set({ source, gesture: "drag", target: null });
    for (const [key, row] of this.rows) {
      row.view?.measureInWindow((_x, y, _width, height) => {
        this.rects.push({ key, kind: row.kind, top: y, bottom: y + height });
      });
    }
  }

  moveDrag(pageY: number) {
    const { source } = this.state;
    if (!source || this.state.gesture !== "drag") return;
    const rect = this.rects.find((item) => pageY >= item.top && pageY < item.bottom);
    let target: DropTarget | null = null;
    if (rect) {
      if (rect.kind === "project") target = { key: rect.key, mode: "top" };
      else {
        const position = (pageY - rect.top) / Math.max(1, rect.bottom - rect.top);
        const mode: DropMode = position < EDGE ? "before" : position > 1 - EDGE ? "after" : "inside";
        target = { key: rect.key, mode };
      }
      if (this.policy?.resolve(source, target) === undefined) target = null;
    }
    const current = this.state.target;
    if (current?.key !== target?.key || current?.mode !== target?.mode) this.set({ target });
  }

  endDrag() {
    const { source, target } = this.state;
    if (source && target) this.drop(source, target);
    this.cancel();
  }

  pick(source: string) {
    this.set({ source, gesture: "pick", target: null });
  }

  /** Completes a pick by tapping a destination. Returns false when that drop is not allowed. */
  place(target: DropTarget): boolean {
    const { source } = this.state;
    if (!source || this.state.gesture !== "pick") return false;
    if (!this.drop(source, target)) return false;
    this.cancel();
    return true;
  }

  cancel() {
    this.rects = [];
    if (this.state.source !== null) this.set({ source: null, gesture: null, target: null });
  }

  private drop(source: string, target: DropTarget): boolean {
    const parent = this.policy?.resolve(source, target);
    if (parent === undefined) return false;
    this.policy?.commit(source, parent);
    return true;
  }
}

/** This row's part of the drag state, re-rendering only when it changes. */
export function useRowDragState(controller: DragController, key: string) {
  const picking = useSyncExternalStore(controller.subscribe, () => {
    const { gesture } = controller.snapshot;
    return gesture === "pick";
  });
  const isSource = useSyncExternalStore(controller.subscribe, () => controller.snapshot.source === key);
  const dropMode = useSyncExternalStore(controller.subscribe, () => {
    const { target } = controller.snapshot;
    return target?.key === key ? target.mode : null;
  });
  const active = useSyncExternalStore(controller.subscribe, () => controller.snapshot.source !== null);
  return { picking, isSource, dropMode, active };
}

export function useDragState(controller: DragController) {
  return useSyncExternalStore(controller.subscribe, () => controller.snapshot);
}

/** Pointer handlers that start a drag once the pointer moves past a small threshold. */
export function useDragHandlers(controller: DragController, key: string, enabled: boolean) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          enabledRef.current &&
          (Math.abs(gesture.dy) > DRAG_THRESHOLD || Math.abs(gesture.dx) > DRAG_THRESHOLD),
        onPanResponderGrant: () => controller.beginDrag(key),
        onPanResponderMove: (_event, gesture) => controller.moveDrag(gesture.moveY),
        onPanResponderRelease: () => controller.endDrag(),
        onPanResponderTerminate: () => controller.cancel(),
        onPanResponderTerminationRequest: () => false,
      }).panHandlers,
    [controller, key],
  );
}
