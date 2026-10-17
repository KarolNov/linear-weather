import { hydrate } from "preact";
import { App } from "./App";

const root = document.getElementById("app");
if (!root) throw new Error("#app element missing");

hydrate(<App />, root);
