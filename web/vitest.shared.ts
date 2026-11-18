import preact from "@preact/preset-vite";
import stylex from "@stylexjs/unplugin";
import type { Plugin } from "vite";

/**
 * The plugins both web test projects compile components with. StyleX must compile them: stylex.create()
 * throws if it runs uncompiled. With `css`, its dev endpoint serves the rules too, so the page is
 * styled as a PM sees it; its polling timer is cleared when the HTTP server closes, which only
 * browser mode has. Without one, the timer would keep Vitest from exiting, so node tests leave it out.
 */
export function webTestPlugins({ css }: { css: boolean }): Plugin[] {
  if (css) {
    // The test page asks for the CSS before every module defining a constant (like
    // `media.hover`) has compiled, so its first rules can hold a `var(--…)` where a media query
    // belongs. Skip those rather than fail the request, which puts Vite's error overlay over the
    // page; StyleX fetches the CSS again as more modules compile, and that one is whole.
    return [stylex.vite({ lightningcssOptions: { errorRecovery: true } }), preact()];
  }
  const stylexPlugin = stylex.vite();
  const { configureServer: _, ...compilerOnly } = stylexPlugin;
  return [compilerOnly, preact()];
}
