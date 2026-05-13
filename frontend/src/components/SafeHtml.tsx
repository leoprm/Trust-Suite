import DOMPurify from "dompurify";
import { memo } from "react";

/**
 * SafeHtml — sanitizes user-supplied HTML before rendering.
 *
 * ALLOWED_TAGS are intentionally restrictive:
 *   formatting: b, i, em, strong, u, s, mark, small, sub, sup
 *   structural: p, br, hr, div, span
 *   links:      a (href sanitized — http/https/mailto only)
 *   lists:      ul, ol, li
 *   headings:   h1–h6
 *   code:       code, pre
 *   block:      blockquote
 *
 * Explicitly DENIED: script, style, iframe, object, embed, form, input,
 * button, img, svg, link, meta, audio, video, canvas, details, summary,
 * event handler attributes (on*).
 */

const ALLOWED_TAGS = [
  "b",
  "i",
  "em",
  "strong",
  "u",
  "s",
  "mark",
  "small",
  "sub",
  "sup",
  "p",
  "br",
  "hr",
  "div",
  "span",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "code",
  "pre",
  "blockquote",
];

const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

// Single DOMPurify instance configured once
const purify = (dirty: string): string =>
  DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // Return clean HTML string — consumer handles the dangerouslySetInnerHTML
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,

    WHOLE_DOCUMENT: false,
    SANITIZE_DOM: true,
    KEEP_CONTENT: true,
  });

interface SafeHtmlProps {
  /** Raw HTML string to sanitize and render. */
  html: string;
  /** Optional className applied to the wrapper span. */
  className?: string;
}

/**
 * Renders sanitized HTML. Wraps output in a <span> so className works
 * without polluting the parent DOM. Use this everywhere you'd previously
 * reach for `dangerouslySetInnerHTML`.
 */
export const SafeHtml = memo(function SafeHtml({
  html,
  className,
}: SafeHtmlProps) {
  const clean = purify(html);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
});

export default SafeHtml;
