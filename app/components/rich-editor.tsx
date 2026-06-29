import { useEffect, useId, useRef, useState } from "react";
import {
  BODY_TAGS,
  TITLE_TAGS,
  countWords,
  sanitizeRichText,
} from "~/lib/richtext";

interface RichEditorProps {
  name: string;
  label: string;
  initialHTML?: string;
  mode: "title" | "body";
  describedById?: string;
  showWordCount?: boolean;
}

// A deliberately limited editor. Title allows italic; body also allows
// superscript and subscript. Formatting is applied by wrapping the selection in
// the real tag, so the markup is exactly em/sup/sub. Paste is cleaned to the
// allowlist. The server sanitizes again on save regardless.
export function RichEditor({
  name,
  label,
  initialHTML = "",
  mode,
  describedById,
  showWordCount = false,
}: RichEditorProps) {
  const tags = mode === "title" ? TITLE_TAGS : BODY_TAGS;
  const editorRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [value, setValue] = useState(() => sanitizeRichText(initialHTML, tags));

  // Set the editable content once after mount, then manage it imperatively so
  // typing does not reset the caret.
  // Set the initial content once after mount, then manage the DOM imperatively.
  // value is intentionally not a dependency: re-running would reset the caret.
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = value;
  }, []);

  function sync() {
    const el = editorRef.current;
    if (!el) return;
    setValue(sanitizeRichText(el.innerHTML, tags));
  }

  function wrap(tag: "em" | "sup" | "sub") {
    const el = editorRef.current;
    if (!el) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed || !el.contains(range.commonAncestorContainer)) return;
    const wrapper = document.createElement(tag);
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    selection.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(wrapper);
    selection.addRange(after);
    sync();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "i") {
      event.preventDefault();
      wrap("em");
    } else if (mode === "body" && event.key === ".") {
      event.preventDefault();
      wrap("sup");
    } else if (mode === "body" && event.key === ",") {
      event.preventDefault();
      wrap("sub");
    }
  }

  function onPaste(event: React.ClipboardEvent) {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const clean = sanitizeRichText(html || text, tags);
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const temp = document.createElement("div");
    temp.innerHTML = clean;
    const fragment = document.createDocumentFragment();
    let lastNode: ChildNode | null = null;
    while (temp.firstChild) lastNode = fragment.appendChild(temp.firstChild);
    range.insertNode(fragment);
    if (lastNode) {
      const after = document.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      selection.removeAllRanges();
      selection.addRange(after);
    }
    sync();
  }

  const toolButton =
    "rounded border border-gray-300 px-2 py-1 text-sm font-medium hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900";

  return (
    <div className="space-y-1">
      <span id={labelId} className="block text-sm font-medium">
        {label}
      </span>
      <div className="flex items-center gap-2" role="toolbar" aria-label={`${label} formatting`}>
        <button
          type="button"
          className={toolButton}
          title="Italic (Ctrl or Cmd + I)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrap("em")}
        >
          <em>I</em>
        </button>
        {mode === "body" ? (
          <>
            <button
              type="button"
              className={toolButton}
              title="Superscript (Ctrl or Cmd + .)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrap("sup")}
            >
              x<sup>2</sup>
            </button>
            <button
              type="button"
              className={toolButton}
              title="Subscript (Ctrl or Cmd + ,)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrap("sub")}
            >
              x<sub>2</sub>
            </button>
          </>
        ) : null}
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline={mode === "body"}
        aria-labelledby={labelId}
        aria-describedby={describedById}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className={
          "w-full rounded border border-gray-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:bg-gray-900 " +
          (mode === "body" ? "min-h-28" : "min-h-12")
        }
      />
      <input type="hidden" name={name} value={value} />
      {showWordCount ? (
        <p className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
          {countWords(value)} words
        </p>
      ) : null}
    </div>
  );
}
