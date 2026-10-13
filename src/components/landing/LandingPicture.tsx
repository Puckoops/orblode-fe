import type { CSSProperties } from "react";
import type { Picture } from "@/lib/landing/media";

const srcSet = (picture: Picture, ext: "avif" | "webp") => picture.widths.map((w) => `${picture.base}-${w}.${ext} ${w}w`).join(", ");

type Props = {
  picture: Picture;
  /** Shown instead of `picture` on narrow screens (max-width: 760px). */
  narrow?: Picture;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
} & { [data: `data-${string}`]: string | number };

/** A pre-rendered capture as AVIF with a WebP fallback, at the widths the encoder wrote. */
export function LandingPicture({ picture, narrow, alt, sizes = "100vw", priority, className, style, ...data }: Props) {
  const largest = picture.widths[picture.widths.length - 1];
  return (
    <picture>
      {narrow && <source media="(max-width: 760px)" type="image/avif" srcSet={srcSet(narrow, "avif")} sizes={sizes} />}
      {narrow && <source media="(max-width: 760px)" type="image/webp" srcSet={srcSet(narrow, "webp")} sizes={sizes} />}
      <source type="image/avif" srcSet={srcSet(picture, "avif")} sizes={sizes} />
      <img
        src={`${picture.base}-${largest}.webp`}
        srcSet={srcSet(picture, "webp")}
        sizes={sizes}
        width={picture.width}
        height={picture.height}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        className={className}
        style={style}
        {...data}
      />
    </picture>
  );
}
