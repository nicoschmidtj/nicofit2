export const Card = ({ className = "", children }) => (
  <div className={`rounded-3xl shadow-lg bg-white/70 dark:bg-zinc-900/60 backdrop-blur border border-zinc-200/60 dark:border-zinc-800 ${className}`}>{children}</div>
);

export const Button = ({ className = "", children, onClick, type = "button", disabled }) => (
  <button type={type} disabled={disabled} onClick={onClick} className={`px-4 py-2 rounded-2xl shadow-sm transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 ${className}`}>{children}</button>
);

export const IconButton = ({ children, onClick, className = "", title }) => (
  <button aria-label={title} onClick={onClick} title={title} className={`p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition ${className}`}>{children}</button>
);

export const Input = (props) => (
  <input
    {...props}
    className={`w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:ring-2 ring-zinc-300 dark:ring-zinc-600 ${props.className || ""}`}
  />
);

export const Label = ({ children }) => (
  <label className="text-sm text-zinc-600 dark:text-zinc-400">{children}</label>
);

