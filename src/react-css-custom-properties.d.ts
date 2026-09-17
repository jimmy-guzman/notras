/**
 * React's `CSSProperties` is closed by design, and its types point at module
 * augmentation as the way to admit custom properties, which is how a dynamic
 * value reaches a class such as `translate-x-(--tab-x)`.
 */
import "react";

declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
