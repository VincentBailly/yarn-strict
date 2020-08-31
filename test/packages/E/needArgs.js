#!/usr/bin/env node

const { argv } = require("process");

if (!argv.includes("--fooBar")) {
  throw new Error("missing args");
}
