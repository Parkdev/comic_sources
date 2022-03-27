import {
  createConfig,
  denoFmt,
  Plugin,
} from "https://raw.githubusercontent.com/nanikit/vim_comic_viewer/39e75df2905fc686cdba2da48f1b96eb2398fe9f/build_src/utils.ts";
import importMap from "./import_map.json" assert { type: "json" };
import tsconfig from "./deno.tsconfig.json" assert { type: "json" };

const implantRequireJs = (dependencies: string[], body: string) => {
  return `'use strict';

if (typeof define !== 'function') {
  throw new Error('requirejs not found.');
}

requirejs.config({
  config: {
    vim_comic_viewer: { GM_xmlhttpRequest: window['GM_xmlhttpRequest'] },
  },
  enforceDefine: true,
});

define('main', (require, exports, module) => {
${body}
});

for (const name of ${JSON.stringify(dependencies)}) {
  const body = GM_getResourceText(name);
  define(name, Function('require', 'exports', 'module', body));
}

unsafeWindow.process = { env: { NODE_ENV: 'production' } };
require(['main'], () => {}, console.error);
`;
};

const replaceVersion = (header: string): string => {
  const dateVersion = new Date().toISOString().replace(/\D+/g, "").slice(
    2,
    12,
  );
  return header.replace("${date_version}", dateVersion);
};

const removePragma = (code: string): string => {
  return code.replace(/\/\/\/\s*?<reference\s.*?\/>\s*?\n/g, "");
};

const postprocess = (code: string) => {
  const header = code.match(
    /(?:^\s*\/\/.*\r?\n?)*?(?:^\s*\/\/.*?==UserScript==.*?\r?\n?)(?:^\s*\/\/.*\r?\n?)+/m,
  )?.[0];
  if (!header) {
    return code;
  }

  let transforming = code.replace(header, "");

  const dependencies = [
    ...header.matchAll(/@resource\s+(\S+)\s+.*?\.js.*?$/gm),
  ];
  if (dependencies.length) {
    const aliases = dependencies.map((x) => x[1]);
    transforming = implantRequireJs(aliases, transforming);
  }

  transforming = removePragma(transforming);
  transforming = replaceVersion(header) + transforming;
  return transforming;
};

const bannerPlugin: Plugin = {
  name: "tampermonkey-header-plugin",
  generateBundle: async (_options, bundle, _isWrite) => {
    for (const [_name, output] of Object.entries(bundle)) {
      if (output.type !== "chunk") {
        continue;
      }
      let transforming = postprocess(output.code);
      transforming = await denoFmt(transforming);
      output.code = transforming;
    }
  },
};

export default createConfig({ importMap, tsconfig, plugins: [bannerPlugin] });
