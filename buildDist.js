const fs = require("fs");
const path = require("path");
const prettier = require("prettier");

fs.rmdirSync("dist", { recursive: true });

fs.mkdirSync("dist", { recursive: true });
const pj = require("./package.json");
const distPJ = {
  name: pj.name,
  version: pj.version,
  bin: pj.bin,
  main: pj.main,
  author: pj.author,
  licence: pj.licence,
  repository: pj.repository,
};

fs.writeFileSync(
  path.join("dist", "package.json"),
  prettier.format(JSON.stringify(distPJ), { parser: "json" })
);

fs.copyFileSync("README.md", path.join("dist", "README.md"));

fs.mkdirSync(path.join("dist", "bin"), { recursive: true });

fs.copyFileSync("index.js", path.join("dist", "index.js"));

fs.readdirSync("bin").forEach((f) => {
  fs.copyFileSync(path.join("bin", f), path.join("dist", "bin", f));
});
