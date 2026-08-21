import { register } from "node:module";

globalThis.__BUZZ_TEST_ENV__ = { MODE: "test", DEV: true, PROD: false };

register("./test-loader-hooks.mjs", import.meta.url);
