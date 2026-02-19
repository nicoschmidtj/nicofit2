const cx = (...parts) => parts.filter(Boolean).join(" ");

const buttonVariants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

const cardVariants = {
  surface: "card-surface",
  elevated: "card-elevated",
};

export const Card = ({ className = "", children, variant = "surface" }) => (
  <div className={cx("ui-card", cardVariants[variant] || cardVariants.surface, className)}>{children}</div>
);

export const Button = ({
  className = "",
  children,
  onClick,
  type = "button",
  disabled,
  variant = "primary",
}) => (
  <button
    type={type}
    disabled={disabled}
    onClick={onClick}
    className={cx("ui-btn", buttonVariants[variant] || buttonVariants.primary, className)}
  >
    {children}
  </button>
);

export const IconButton = ({ children, onClick, className = "", title }) => (
  <button
    aria-label={title}
    onClick={onClick}
    title={title}
    className={cx("ui-icon-btn", className)}
  >
    {children}
  </button>
);

export const Input = ({ className = "", ...props }) => (
  <input {...props} className={cx("ui-input", className)} />
);

export const Label = ({ children }) => <label className="ui-label">{children}</label>;
