import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ icon, children, variant = "ghost", className = "", ...props }: ButtonProps) {
  return (
    <button className={`ui-button ui-button-${variant} ${className}`} {...props}>
      {icon ? <span className="ui-button-icon">{icon}</span> : null}
      {children ? <span className="ui-button-label">{children}</span> : null}
    </button>
  );
}
