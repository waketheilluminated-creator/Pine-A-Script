type EscapeEvent = Pick<KeyboardEvent, "preventDefault" | "stopImmediatePropagation">;

type WorkspaceEscapeOptions = {
  searchOpen: boolean;
  event: EscapeEvent;
  closeSearch(): void;
  cancelDrawing(): void;
};

export function handleWorkspaceEscape({
  searchOpen,
  event,
  closeSearch,
  cancelDrawing,
}: WorkspaceEscapeOptions): void {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (searchOpen) {
    closeSearch();
    return;
  }
  cancelDrawing();
}
