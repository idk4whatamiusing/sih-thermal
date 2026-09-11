import { SplitText } from "gsap/SplitText";

type SplitOpts = ConstructorParameters<typeof SplitText>[1];

// SplitText that can never crash the page: returns null when the
// plugin or DOM isn't ready, callers must null-check.
export function safeSplit(
  el: Element | null,
  opts: SplitOpts,
): SplitText | null {
  try {
    if (!el) return null;
    return new SplitText(el, opts);
  } catch (err) {
    console.error("SplitText failed:", err);
    return null;
  }
}
