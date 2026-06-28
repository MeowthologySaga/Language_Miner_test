import type { ReactNode } from "react";

type EmptyStateProps = {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  "data-qa"?: string;
};

export function EmptyState({
  actions,
  className,
  description,
  icon,
  title,
  "data-qa": dataQa
}: EmptyStateProps) {
  return (
    <div className={className ? `empty-state ${className}` : "empty-state"} data-qa={dataQa}>
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <div className="empty-state-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </div>
  );
}
