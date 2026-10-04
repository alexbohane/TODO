// ── Markdown rendering ────────────────────────────────────────────────────
// `marked` and `DOMPurify` are globals from the vendored classic scripts.
const mdRenderer = new marked.Renderer();
mdRenderer.link = function ({ href, text }) {
  return `<a href="${href}" class="todo-link" target="_blank" rel="noopener" data-action="link">${text}</a>`;
};
marked.setOptions({ renderer: mdRenderer, breaks: true, gfm: true });

// Sanitised so raw HTML in a description can't run script; `target` is kept
// so links still open in a new tab
export function renderDesc(raw) {
  return DOMPurify.sanitize(marked.parse(raw), { ADD_ATTR: ["target"] });
}

// ── Markdown editing helpers ──────────────────────────────────────────────
function getLineRange(value, start, end) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;
  return [lineStart, lineEnd];
}

function indentLines(textarea, outdent) {
  const { value, selectionStart, selectionEnd } = textarea;
  const [lineStart, lineEnd] = getLineRange(value, selectionStart, selectionEnd);
  const lines = value.slice(lineStart, lineEnd).split("\n");

  let startDelta = 0, totalDelta = 0;
  const newLines = lines.map((line, i) => {
    if (outdent) {
      const removed = line.match(/^( {1,2}|\t)/);
      const len = removed ? removed[0].length : 0;
      if (i === 0) startDelta = -len;
      totalDelta -= len;
      return line.slice(len);
    }
    if (i === 0) startDelta = 2;
    totalDelta += 2;
    return "  " + line;
  });

  textarea.setRangeText(newLines.join("\n"), lineStart, lineEnd, "select");
  textarea.selectionStart = Math.max(lineStart, selectionStart + startDelta);
  textarea.selectionEnd   = Math.max(textarea.selectionStart, selectionEnd + totalDelta);
}

function continueList(e, textarea) {
  const { value, selectionStart, selectionEnd } = textarea;
  if (selectionStart !== selectionEnd) return false;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const line  = value.slice(lineStart, selectionStart);
  const match = line.match(/^(\s*)([-*+]|\d+\.)( +)(\[[ xX]\] +)?(.*)$/);
  if (!match) return false;

  const [, indent, marker, , check, content] = match;
  e.preventDefault();

  if (content.trim() === "") {
    textarea.setRangeText("", lineStart, selectionStart, "end");
  } else {
    const nextMarker = /^\d+\.$/.test(marker) ? `${parseInt(marker, 10) + 1}.` : marker;
    textarea.setRangeText(`\n${indent}${nextMarker} ${check ? "[ ] " : ""}`, selectionStart, selectionEnd, "end");
  }
  return true;
}

function wrapSelection(textarea, wrapper) {
  const { value, selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const before   = value.slice(selectionStart - wrapper.length, selectionStart);
  const after    = value.slice(selectionEnd, selectionEnd + wrapper.length);

  if (selected && before === wrapper && after === wrapper) {
    textarea.setRangeText(selected, selectionStart - wrapper.length, selectionEnd + wrapper.length, "select");
    textarea.selectionStart = selectionStart - wrapper.length;
    textarea.selectionEnd   = textarea.selectionStart + selected.length;
  } else {
    textarea.setRangeText(`${wrapper}${selected}${wrapper}`, selectionStart, selectionEnd, "end");
    textarea.selectionStart = selectionStart + wrapper.length;
    textarea.selectionEnd   = textarea.selectionStart + selected.length;
  }
}

export function attachMarkdownEditing(textarea) {
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      indentLines(textarea, e.shiftKey);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (e.key === "Enter") {
      if (continueList(e, textarea)) {
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "b" || key === "i") {
        e.preventDefault();
        wrapSelection(textarea, key === "b" ? "**" : "*");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  });
}
