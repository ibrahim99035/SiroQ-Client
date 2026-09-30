/**
 * Lets a plain Node script import a module marked `server-only`.
 *
 * `server-only` exists to keep server code — AWS credentials, Prisma — out of a
 * client bundle, and it works by throwing on import unless the bundler resolved
 * the `react-server` export condition. A maintenance script is not a client
 * bundle, so the marker is meaningless there and only blocks the script.
 *
 * Preloaded with `tsx --require`, this maps the bare specifier to an empty
 * module. It is scoped to script invocations; nothing in the app or the build
 * sees it, so the real guard stays intact.
 */
const path = require("node:path");
const Module = require("node:module");

const EMPTY = path.join(__dirname, "empty.cjs");
const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return EMPTY;
  return resolveFilename.call(this, request, ...rest);
};
