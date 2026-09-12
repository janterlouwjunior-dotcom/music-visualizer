import type { HTMLAttributes, ReactNode } from "react";
import "./Panel.css";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, actions, className, children, ...rest }: PanelProps) {
  const classes = ["mtv-panel", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {(title || actions) && (
        <div className="mtv-panel__header">
          {title && <div className="mtv-panel__title">{title}</div>}
          {actions && <div className="mtv-panel__actions">{actions}</div>}
        </div>
      )}
      <div className="mtv-panel__body">{children}</div>
    </div>
  );
}
