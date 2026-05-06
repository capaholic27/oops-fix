import { X } from "lucide-react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  tip?: string;
  icon?: ReactNode;
  onClose: () => void;
};

/**
 * Bottom-sheet that explains a single metric. Matches the visual language of
 * StatCardDetail so every "what does this mean?" affordance feels native.
 */
export const MetricInfoSheet = ({ open, title, description, tip, icon, onClose }: Props) => {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[70vh] bg-card border-t-2 border-foreground overflow-y-auto animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b-2 border-border z-10">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              {icon}
              {title}
            </span>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="px-3 py-3 space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              What it means
            </p>
            <p className="text-xs text-foreground leading-relaxed">{description}</p>
          </div>
          {tip && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">
                Smart tip
              </p>
              <p className="text-xs text-foreground leading-relaxed">{tip}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
