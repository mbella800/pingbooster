"use client";

import { useEffect } from "react";

export function MotionRuntime() {
  useEffect(() => {
    const root = document.documentElement;
    const nav = document.querySelector(".site-nav");
    const revealItems = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const counters = Array.from(
      document.querySelectorAll<HTMLElement>("[data-counter]"),
    );
    const stage = document.querySelector<HTMLElement>(".network-stage");
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const onScroll = () => {
      nav?.classList.toggle("is-scrolled", window.scrollY > 24);
      root.style.setProperty("--page-scroll", `${window.scrollY}px`);
    };

    if (reducedMotion) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
    } else {
      const revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -45px" },
      );
      revealItems.forEach((item) => revealObserver.observe(item));

      const counterObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const element = entry.target as HTMLElement;
            const target = Number(element.dataset.counter ?? "0");
            const suffix = element.dataset.suffix ?? "";
            const duration = 950;
            const started = performance.now();
            const tick = (now: number) => {
              const progress = Math.min((now - started) / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              element.textContent = `${Math.round(target * eased)}${suffix}`;
              if (progress < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            counterObserver.unobserve(element);
          });
        },
        { threshold: 0.6 },
      );
      counters.forEach((counter) => counterObserver.observe(counter));
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!stage || reducedMotion) return;
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      stage.style.setProperty("--tilt-x", `${y * -4}deg`);
      stage.style.setProperty("--tilt-y", `${x * 5}deg`);
      stage.style.setProperty("--glow-x", `${(x + 0.5) * 100}%`);
      stage.style.setProperty("--glow-y", `${(y + 0.5) * 100}%`);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    stage?.addEventListener("pointermove", onPointerMove);

    return () => {
      window.removeEventListener("scroll", onScroll);
      stage?.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return null;
}
