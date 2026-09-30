import Image from "next/image";

/**
 * The SiroQ logo.
 *
 * Two cuts are kept in `public/brand`, both generated from `brand/` by
 * `npm run brand:assets`:
 *
 *   - the lockup (badge + wordmark) for headers, the hero and social cards
 *   - the wordmark alone for places that already show the badge nearby
 *
 * Both a light and a reversed (white) variant exist because JPEG sources cannot
 * be transparent, and a white rectangle around a dark logo is invisible only on
 * a white page. The reversed files are for the dark surfaces.
 *
 * The intrinsic sizes are the generated pixel dimensions, so `next/image` can
 * reserve layout space before the file arrives — worth doing here because the
 * logo sits in the sticky header, and an unsized image makes the whole page
 * shift on load.
 */
export function BrandLogo({
  variant = "lockup",
  tone = "ink",
  height = 28,
  priority = false,
  className,
}: {
  variant?: "lockup" | "wordmark";
  /** `ink` for light backgrounds, `reversed` for the dark ones. */
  tone?: "ink" | "reversed";
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  // Generated at 96px tall; these are the true aspect ratios of those files.
  const width = variant === "lockup" ? Math.round((307 / 96) * height) : Math.round((235 / 96) * height);

  return (
    <Image
      src={
        tone === "reversed"
          ? `/brand/siroq-${variant}-reversed.png`
          : `/brand/siroq-${variant}.png`
      }
      alt="SiroQ"
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
