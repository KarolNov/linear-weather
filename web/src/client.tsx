import { hydrate } from "preact";
import { App, type AppProps } from "./App";

const root = document.getElementById("app");
const propsScript = document.getElementById("app-props");
if (!root || !propsScript) throw new Error("#app or #app-props element missing");

const props = JSON.parse(propsScript.textContent ?? "{}") as AppProps;
hydrate(<App {...props} />, root);
