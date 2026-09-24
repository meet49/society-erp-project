import * as React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, loading, onConfirm, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; loading?: boolean; onConfirm: () => void | Promise<void>; children?: React.ReactNode }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            destructive={destructive}
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Imperative helper: const confirm = useConfirm(); await confirm({ title }) → boolean */
export function useConfirm() {
  const [state, setState] = React.useState<{ open: boolean; title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean; resolve?: (v: boolean) => void }>({ open: false, title: '' });
  const confirm = React.useCallback((opts: { title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean }) => new Promise<boolean>((resolve) => setState({ ...opts, open: true, resolve })), []);
  const element = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) {
          state.resolve?.(false);
          setState((s) => ({ ...s, open: false }));
        }
      }}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      destructive={state.destructive}
      onConfirm={() => {
        state.resolve?.(true);
        setState((s) => ({ ...s, open: false }));
      }}
    />
  );
  return { confirm, ConfirmElement: element };
}
