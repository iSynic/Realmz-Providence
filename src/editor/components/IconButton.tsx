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
    <button className="icon-btn" title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
