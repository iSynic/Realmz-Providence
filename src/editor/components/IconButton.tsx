import { ReactNode } from "react";

export function IconButton({
  title,
  disabled,
  onClick,
  children
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="icon-btn" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
