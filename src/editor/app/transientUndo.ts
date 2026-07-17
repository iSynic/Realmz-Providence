export type TransientUndoScope = {
  label: string;
  undo: () => void;
};

export function invokePreferredUndo(scope: TransientUndoScope | null, fallback: () => void) {
  if (scope) {
    scope.undo();
    return;
  }
  fallback();
}
