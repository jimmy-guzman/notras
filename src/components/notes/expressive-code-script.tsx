"use client";

import type { ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "react-markdown";

import { useEffect } from "react";

type Props = ComponentPropsWithoutRef<"script"> & ExtraProps;

/**
 * Intercepts `<script>` elements injected by `rehype-expressive-code` and
 * re-executes them by appending a real `<script>` to the document.
 *
 * `react-markdown` renders `<script>` tags as inert React elements — React
 * intentionally never executes scripts injected via JSX. `rehype-expressive-code`
 * relies on a `<script type="module">` to wire up the copy-to-clipboard button's
 * click handler, so without this the copy button silently does nothing.
 */
export function ExpressiveCodeScript({ children, type }: Props) {
  const code = typeof children === "string" ? children : undefined;

  useEffect(() => {
    if (!code) return;

    const script = document.createElement("script");

    if (type) script.type = type;

    script.textContent = code;
    document.head.append(script);
    script.remove();
  }, [code, type]);

  return null;
}
