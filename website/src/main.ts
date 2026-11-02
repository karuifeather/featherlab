import { ViteSSG } from "vite-ssg/single-page";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/main.scss";
import App from "./App.vue";

export const createApp = ViteSSG(App);
