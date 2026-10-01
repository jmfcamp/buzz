// Playwright transpiles test imports with Babel. Vite defines `import.meta.env`
// in the browser bundle. Node leaves it empty, so a module-scope read throws
// while tests are collected. The built page still gets the real Vite env.
module.exports = function buzzPlaywrightImportMetaEnv() {
  return {
    name: "buzz-playwright-import-meta-env",
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        if (node.computed || node.property?.type !== "Identifier") return;
        if (node.property.name !== "env") return;
        const object = node.object;
        if (object?.type !== "MetaProperty") return;
        if (
          object.meta?.name !== "import" ||
          object.property?.name !== "meta"
        ) {
          return;
        }
        path.replaceWithSourceString(
          '(globalThis.__BUZZ_TEST_ENV__ ?? { MODE: "e2e", DEV: false, PROD: true })',
        );
      },
    },
  };
};
