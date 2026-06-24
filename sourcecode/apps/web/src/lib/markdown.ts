import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Render user markdown to sanitized HTML. Raw HTML in the source is NOT trusted —
// marked emits HTML, then DOMPurify strips anything dangerous (scripts, event
// handlers, etc.). Use with dangerouslySetInnerHTML only on this output.
export function renderMarkdown(src: string): string {
  const html = marked.parse(src ?? '', { async: false, breaks: true }) as string
  return DOMPurify.sanitize(html)
}
