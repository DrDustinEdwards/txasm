import { useEffect, useId, useRef, useState } from "react";

export interface InstitutionSuggestion {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  country: string | null;
}

// A type-ahead for the institution master list. Free text is always allowed (a
// new institution is saved on submit); picking a suggestion fills the city,
// region, and country. It follows the ARIA combobox pattern: arrow keys move the
// active option, Enter selects it, Escape closes, and it queries /api/institutions
// with a short debounce.
export function InstitutionAutocomplete({
  id,
  label,
  value,
  onChange,
  onSelect,
  inputClassName,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (name: string) => void;
  onSelect: (institution: InstitutionSuggestion) => void;
  inputClassName: string;
}) {
  const [results, setResults] = useState<InstitutionSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  // Skip the next fetch after a selection, since selecting sets value to the name.
  const suppressFetch = useRef(false);

  useEffect(() => {
    if (suppressFetch.current) {
      suppressFetch.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/institutions?q=${encodeURIComponent(query)}`, {
        headers: { Accept: "application/json" },
      })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => {
          if (cancelled) return;
          const list =
            (data as { results?: InstitutionSuggestion[] }).results ?? [];
          setResults(list);
          setOpen(list.length > 0);
          setActiveIndex(-1);
        })
        .catch(() => {
          // A failed type-ahead request should not disrupt typing.
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function choose(suggestion: InstitutionSuggestion) {
    suppressFetch.current = true;
    onSelect(suggestion);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      if (open && activeIndex >= 0 && activeIndex < results.length) {
        event.preventDefault();
        choose(results[activeIndex]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="block text-sm">
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
        }
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        className={inputClassName}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface-raised shadow-lg"
        >
          {results.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={
                "cursor-pointer px-3 py-2 text-sm " +
                (index === activeIndex ? "bg-panel text-text" : "text-text")
              }
            >
              <span className="font-medium">{suggestion.name}</span>
              {suggestion.city || suggestion.region ? (
                <span className="text-text-muted">
                  {" . "}
                  {[suggestion.city, suggestion.region].filter(Boolean).join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
