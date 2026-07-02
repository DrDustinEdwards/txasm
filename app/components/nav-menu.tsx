import { useEffect, useId, useRef, useState } from "react";
import { NavLink } from "react-router";

export interface NavMenuItem {
  label: string;
  to: string;
}

export interface NavMenuGroup {
  heading?: string;
  items: NavMenuItem[];
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={open ? "rotate-180 transition-transform" : "transition-transform"}
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  );
}

// An accessible grouped disclosure menu (not hover-only). The button carries
// aria-expanded and opens on click or keyboard; opening moves focus into the
// panel; Escape closes and returns focus to the button; clicking outside or
// tabbing out of the panel closes it.
export function NavMenu({
  label,
  groups,
}: {
  label: string;
  groups: NavMenuGroup[];
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onFocusOut(event: FocusEvent) {
      const next = event.relatedTarget as Node | null;
      if (
        next &&
        !panelRef.current?.contains(next) &&
        !buttonRef.current?.contains(next)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    panel?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      panel?.removeEventListener("focusout", onFocusOut);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-text hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {label}
        <Chevron open={open} />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute left-0 z-40 mt-1 min-w-64 rounded-lg border border-border bg-surface-raised p-4 shadow-lg"
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {groups.map((group, index) => (
              <div key={group.heading ?? index} className="min-w-40">
                {group.heading ? (
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {group.heading}
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={`${item.to}-${item.label}`}>
                      <NavLink
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className="block rounded px-2 py-1.5 text-sm text-text hover:bg-panel hover:text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
