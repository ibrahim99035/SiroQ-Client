"use client";

import { useEffect, useRef } from "react";

import { useMounted } from "@/components/use-mounted";

/**
 * Decorative background of drifting pharmacy motifs for the landing page hero.
 *
 * Painted on a `<canvas>` rather than with DOM nodes: a couple of dozen animated
 * elements re-styled every frame is the case where the DOM stops being cheap,
 * and a single canvas keeps this to one composited layer with no per-particle
 * React reconciliation.
 *
 * The motifs are drawn rather than bitmapped — a capsule, a hexagon ring, a
 * cross, and a "molecule" of bonded dots — so they stay crisp at any DPR and add
 * no image requests.
 *
 * Accessibility
 * - `aria-hidden` with no text content, so it is invisible to assistive tech.
 * - `pointer-events-none`, so it can never intercept a click meant for a CTA.
 * - Honours `prefers-reduced-motion` by rendering one static frame: the
 *   composition is still there, nothing moves.
 * - Stops entirely when the tab is hidden or the canvas scrolls out of view,
 *   which is most of the CPU saving on a long marketing page.
 */

type Kind = "capsule" | "ring" | "cross" | "molecule";

interface Particle {
  x: number;
  y: number;
  /** Size on the 16px grid the icons use. */
  r: number;
  kind: Kind;
  vx: number;
  vy: number;
  /** Rotation in radians, and its angular velocity. */
  rot: number;
  vrot: number;
  /** 0–1; multiplied into the stroke/fill alpha. */
  alpha: number;
  /** Warm or accent. Two tints keep it from reading as noise. */
  warm: boolean;
}

const COUNT_DESKTOP = 22;
const COUNT_MOBILE = 12;
function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeParticle(w: number, h: number): Particle {
  const kind: Kind = ["capsule", "ring", "cross", "molecule"][
    Math.floor(Math.random() * 4)
  ] as Kind;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    r: random(5, 13),
    kind,
    vx: random(-0.12, 0.12),
    vy: random(-0.16, -0.04),
    rot: random(0, Math.PI * 2),
    vrot: random(-0.004, 0.004),
    alpha: random(0.1, 0.3),
    warm: Math.random() < 0.3,
  };
}

/**
 * Draws one motif.
 *
 * Takes the colour prefix rather than baking a tint in, so the palette can be
 * re-read per frame from the theme attribute without rebuilding the particle list.
 */
function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  linePrefix: string,
) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  const stroke = (a: number) => `${linePrefix}${a})`;
  const fill = (a: number) => `${linePrefix}${a})`;

  if (p.kind === "capsule") {
    const w = p.r * 2.6;
    const h = p.r;
    ctx.strokeStyle = stroke(p.alpha);
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.arc(-w / 4, 0, h / 2, Math.PI / 2, -Math.PI / 2);
    ctx.lineTo(w / 4, h / 2);
    ctx.arc(w / 4, 0, h / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-w / 4, -h / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
  } else if (p.kind === "ring") {
    ctx.strokeStyle = stroke(p.alpha);
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.kind === "cross") {
    const s = p.r * 0.62;
    ctx.strokeStyle = stroke(p.alpha);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s);
    ctx.moveTo(-s, 0);
    ctx.lineTo(s, 0);
    ctx.stroke();
  } else {
    ctx.strokeStyle = stroke(p.alpha);
    const a: readonly [number, number] = [0, 0];
    const b: readonly [number, number] = [p.r * 1.2, p.r * 0.5];
    const c: readonly [number, number] = [p.r * 0.5, p.r * 1.3];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.stroke();
    ctx.fillStyle = fill(Math.min(1, p.alpha * 1.3));
    for (const [nx, ny] of [a, b, c]) {
      ctx.beginPath();
      ctx.arc(nx, ny, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function PharmacyParticles({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The theme attribute lives on <html>; particles read it once per frame so
  // they tint correctly without a second canvas per theme.
  const mounted = useMounted();

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;
    let running = true;

    // Dark surfaces need a lighter tint or the motifs disappear against the ink.
    const palette = () =>
      document.documentElement.dataset.theme === "dark"
        ? { line: "rgba(134,198,189,", warm: "rgba(217,151,94," }
        : { line: "rgba(46,111,106,", warm: "rgba(201,122,61," };

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count =
        width < 640
          ? COUNT_MOBILE
          : Math.round(
              Math.min(COUNT_DESKTOP, (width * height) / 62000),
            );
      particles = Array.from({ length: Math.max(0, count) }, () =>
        makeParticle(width, height),
      );
    }

    function step() {
      if (!ctx) return;
      const { line, warm } = palette();
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        // Wrap rather than respawn, so density stays constant over time.
        if (p.y < -20) {
          p.y = height + 20;
          p.x = Math.random() * width;
        }
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;

        // Draw with the themed tint rather than the constant baked into `draw`.
        drawParticle(ctx, p, p.warm ? warm : line);
      }

      if (running) frame = requestAnimationFrame(step);
    }

    resize();
    if (reduceMotion.matches) {
      // One static frame: composition without movement.
      step();
      running = false;
    } else {
      frame = requestAnimationFrame(step);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Pause when hidden or off-screen; a hero animation is otherwise a
    // permanently busy main thread on a page the visitor has scrolled past.
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const visible = entry.isIntersecting && !document.hidden;
        if (visible && !running && !reduceMotion.matches) {
          running = true;
          frame = requestAnimationFrame(step);
        } else if (!visible && running) {
          running = false;
          cancelAnimationFrame(frame);
        }
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!reduceMotion.matches) {
        running = true;
        frame = requestAnimationFrame(step);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mounted]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={
        "pointer-events-none absolute inset-0 h-full w-full " +
        (className ?? "")
      }
    />
  );
}

