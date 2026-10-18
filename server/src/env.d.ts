// Bindings that `wrangler types` can't infer because they're optional.
interface Env {
  /** Dev shortcut: personal Linear API key, honored only on localhost. */
  LINEAR_API_KEY?: string;
}

declare namespace Cloudflare {
  interface Env {
    LINEAR_API_KEY?: string;
  }
}
