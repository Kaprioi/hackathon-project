import { Fragment } from "react";
import { splitHighlight } from "../i18n/translate";

/**
 * Shows a translated heading like "How it *works*", with the starred words in
 * the blue gradient (or wrapped by `wrap`, for a different look).
 */
export default function Highlight({
  text,
  wrap = (part) => <span className="text-gradient-brand">{part}</span>,
}: {
  text: string;
  wrap?: (part: string) => React.ReactNode;
}) {
  return splitHighlight(text).map((part, i) => (
    <Fragment key={i}>{part.highlighted ? wrap(part.text) : part.text}</Fragment>
  ));
}
