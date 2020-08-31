const child_process = require("child_process");
const path = require("path");
const fs = require("fs");

process.chdir(__dirname);

console.log("##### TESTING INSTALLATION PROCESS ######");

shouldFail("args are passed to yarn cli", () => {
  child_process.execSync("npx .. sdfgsdfg", { stdio: "ignore" });
});

shouldWork("install", () => {
  child_process.execSync("git clean -fdx && npx ..");
});

shouldWork("install a second time", () => {
  child_process.execSync("npx ..");
});

console.log();
console.log("##### TESTING REQUIRING DEPENDENCIES ######");

shouldWork("root dependencies are installed", () => {
  require("@types/node/package.json");
});

shouldFail("dependencies of a workspace are not accessible from root", () => {
  require("lodash");
});

shouldWork("root dependencies to workspace should resolve", () => {
  require("B/package.json");
});

shouldFail(
  "undeclared dependencies from root to workspace don't resolve",
  () => {
    require("A/package.json");
  }
);

shouldWork("declared dependencies between internal-packages work", () => {
  require.resolve("B/package.json", {
    paths: [path.join(process.cwd(), "packages", "A")],
  });
});

shouldWork(
  "declared dependencies between internal-packages with scoped name work",
  () => {
    require.resolve("@scoped/C/package.json", {
      paths: [path.join(process.cwd(), "packages", "A")],
    });
  }
);

shouldFail(
  "undeclared dependencies cross internal-packages should not resolve",
  () => {
    require.resolve("A/package.json", {
      paths: [path.join(process.cwd(), "packages", "B")],
    });
  }
);

shouldWork(
  "declared dependencies from workspace to external should resolve",
  () => {
    require.resolve("lodash/package.json", {
      paths: [path.join(process.cwd(), "packages", "A")],
    });
  }
);

shouldFail("transitive dependencies should not resolve", () => {
  require.resolve("cross-spawn/package.json", {
    paths: [path.join(process.cwd(), "packages", "A")],
  });
});

console.log();
console.log("##### TESTING BIN SCRIPTS ######");

shouldWork("run script for declared dependencies cross local-packages", () => {
  child_process.execSync("yarn B", {
    cwd: path.join(process.cwd(), "packages", "A"),
  });
});

shouldFail(
  "undeclared dependencies from root to local-package will not resolve bin script",
  () => {
    child_process.execSync("yarn A", { stdio: "ignore" });
  }
);

shouldFail(
  "scripts from undeclared dependencies cross local-packages fail",
  () => {
    child_process.execSync("yarn C", {
      cwd: path.join(process.cwd(), "packages", "B"),
      stdio: "ignore",
    });
  }
);

// A depends on @scoped/C, bin exposed by @scoped/C is call `C`
shouldWork("bin scripts from scoped packages work", () => {
  child_process.execSync("yarn C", {
    cwd: path.join(process.cwd(), "packages", "A"),
  });
});

// A depends on E, E exposes script `scriptE`
shouldWork("bin scripts with explicit name work", () => {
  child_process.execSync("yarn scriptE", {
    cwd: path.join(process.cwd(), "packages", "A"),
  });
});

shouldWork("args are forwarded to bin scripts", () => {
  child_process.execSync("yarn needArgs --fooBar", {
    cwd: path.join(process.cwd(), "packages", "A"),
  });
});

console.log();
console.log("##### TESTING LIFECYCLE SCRIPTS ######");

shouldWork("pre-install script ran as expected", () => {
  if (!fs.existsSync(path.join("node_modules", "pre-install"))) {
    throw new Error("");
  }
});

console.log(`
Here is a list of tests to run manually:
 - deleted dependencies are not there anymore after a new install
    1 - install dependencies
    2 - remove dependencies A -> lodash
    3 - install dependencies
    4 - require lodash in A should fail
 - delete bins are not there anymore after a new install
    1 - install dependencies
    2 - remove bin field in B/package.json
    3 - install dependencies
    4 - \`yarn B\` in A should fail
 - changes to yarn.lock files are correctly reflected (not ignored/reverted)
    1 - add an external dependency to a package.json file in the repo
    2 - install dependencies
    3 - observe the expected changes in the yarn.lock file.
`);

function shouldWork(name, fn) {
  try {
    fn();
    console.log(`SUCCESS: ${name}`);
  } catch {
    console.error(`FAILED: ${name}`);
    process.exit(1);
  }
}

function shouldFail(name, fn) {
  try {
    fn();
    console.error(`FAILED: ${name}`);
    process.exit(1);
  } catch {
    console.log(`SUCCESS: ${name}`);
  }
}
