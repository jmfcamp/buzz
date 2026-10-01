import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Node has no loader for the files Vite accepts. Playwright's transpiler
 * parses app modules, so a stylesheet or bare JSON import crashes test
 * collection. Serve those files here. The page under test still gets the
 * real assets from the Vite build.
 */
const ASSET = /\.(?:png|jpe?g|gif|svg|webp|avif|ico)$/;

// emoji-mart's package entry is CJS. Node's ESM loader cannot see the named
// `init` export. Playwright only collects tests here; the built page loads
// the real package.
const STUBS = new Map([
  [
    "emoji-mart",
    "export const init = () => {};\nexport const SearchIndex = { search: async () => [] };\nexport default {};\n",
  ],
  ["@emoji-mart/react", "export default function Picker() { return null; }\n"],
]);

export async function resolve(specifier, context, nextResolve) {
  if (STUBS.has(specifier)) {
    return {
      shortCircuit: true,
      url: `buzz-playwright-stub:${encodeURIComponent(specifier)}`,
    };
  }
  const bare = specifier.split("?")[0];
  if (ASSET.test(bare) || bare.endsWith(".css")) {
    return {
      shortCircuit: true,
      url: `buzz-playwright-asset:${encodeURIComponent(specifier)}`,
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("buzz-playwright-stub:")) {
    const name = decodeURIComponent(url.slice("buzz-playwright-stub:".length));
    return {
      format: "module",
      shortCircuit: true,
      source: STUBS.get(name) ?? "export default {};\n",
    };
  }

  if (url.startsWith("buzz-playwright-asset:")) {
    return {
      format: "module",
      shortCircuit: true,
      source: 'export default "test-asset";\n',
    };
  }

  if (url.startsWith("file:")) {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith(".css")) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export default {};\n",
      };
    }
    if (pathname.endsWith(".json")) {
      return {
        format: "json",
        shortCircuit: true,
        source: fs.readFileSync(fileURLToPath(url), "utf8"),
      };
    }
    if (ASSET.test(pathname)) {
      return {
        format: "module",
        shortCircuit: true,
        source: 'export default "test-asset";\n',
      };
    }
  }

  return nextLoad(url, context);
}
