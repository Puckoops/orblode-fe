export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isCoarsePointer = () => window.matchMedia("(pointer: coarse)").matches;

/** A font stack from a CSS custom property, resolved, for canvas text. */
export const cssFont = (el: Element, property: string, fallback: string) => getComputedStyle(el).getPropertyValue(property).trim() || fallback;

/** Calls `onChange` as `el` enters and leaves the viewport, give or take `margin`. */
export function watchVisibility(el: Element, onChange: (visible: boolean) => void, margin = "120px 0px") {
  const observer = new IntersectionObserver((entries) => onChange(entries[entries.length - 1].isIntersecting), { rootMargin: margin });
  observer.observe(el);
  return () => observer.disconnect();
}
