import { useEffect } from "react";

/**
 * Mobile browsers do not shrink the layout viewport when the on-screen keyboard
 * opens, so a full-height shell keeps its size and search results end up hidden
 * behind the keyboard. We publish two CSS variables from the visual viewport:
 *
 *  --kb-inset  : height covered by the keyboard (0 when closed)
 *  --app-height: usable height for the app shell
 *
 * Focused inputs are also scrolled into view so the field being typed in stays
 * visible above the keyboard.
 */
export function useViewportInsets() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const vv = window.visualViewport;
      const full = window.innerHeight;
      const visible = vv ? vv.height : full;
      const offset = vv ? vv.offsetTop : 0;
      const inset = Math.max(0, Math.round(full - visible - offset));
      root.style.setProperty("--kb-inset", `${inset}px`);
      root.style.setProperty("--app-height", `${Math.round(visible)}px`);
    };

    apply();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("orientationchange", apply);
    window.addEventListener("resize", apply);

    let raf = 0;
    const onFocusIn = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") return;
      cancelAnimationFrame(raf);
      // Wait for the keyboard animation before scrolling the field into view.
      window.setTimeout(() => {
        raf = requestAnimationFrame(() => {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      }, 260);
    };
    document.addEventListener("focusin", onFocusIn);

    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("resize", apply);
      document.removeEventListener("focusin", onFocusIn);
      cancelAnimationFrame(raf);
    };
  }, []);
}
