import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getWorkspaces, Workspace } from "./workspaces";

const workspaces = getWorkspaces();

let lifecycleScripts: {
  preinstall?: string;
  postinstall?: string;
  install?: string;
  prepare?: string;
} = {};

// 1 - For now we clean everything before each install
cleanNodeModuleFolders();

// 2 - Create the store
copyRepoLayoutToStore();

// 3 - Run pre-install script
runPreInstallScript();

// 4 - Execute yarn install in the store
runYarnInstallInStore();

// 5 - Run  post-install scripts
runPostInstallScripts();

// 6 - Copy yarn.lock back, so changes can be commited
hidrateYarnLockFile();

// 7 - Setup links from the repo to the store
linkRepoNodeModuleFoldersToStore();

function linkRepoNodeModuleFoldersToStore() {
  setupDependencyBetweenWorkspaces();
  setupExternalDependencies();
}

function setupExternalDependencies() {
  workspaces.forEach((workspace) => {
    const pj = require(path.join(
      process.cwd(),
      workspace.location,
      "package.json"
    ));
    const dependencies = new Set(
      [
        ...Object.keys(pj.dependencies || {}),
        ...Object.keys(pj.devDependencies || {}),
      ].filter((n) => !workspaces.find((w) => w.name === n))
    );
    dependencies.forEach((d) => {
      const resolvedDependency = fs.realpathSync(
        path.dirname(
          require.resolve(`${d}/package.json`, {
            paths: [
              path.join(
                process.cwd(),
                "node_modules",
                ".store",
                workspace.location
              ),
            ],
          })
        )
      );

      setupDependencySymlink(workspace, d, resolvedDependency);

      setupBinScripts(resolvedDependency, d, workspace);
    });
  });
}

function setupDependencySymlink(
  workspace: Workspace,
  d: string,
  resolvedDependency: string
) {
  fs.mkdirSync(
    path.dirname(
      path.join(process.cwd(), workspace.location, "node_modules", d)
    ),
    { recursive: true }
  );

  const symlink = path.join(
    process.cwd(),
    workspace.location,
    "node_modules",
    d
  );

  fs.symlinkSync(resolvedDependency, symlink, "junction");
}

function setupDependencyBetweenWorkspaces() {
  workspaces.forEach((workspace) => {
    workspace.dependencies.forEach((d) => {
      const localDependencyLocation = path.join(process.cwd(), d.location);
      const symlink = path.join(
        process.cwd(),
        workspace.location,
        "node_modules",
        d.name
      );
      fs.mkdirSync(path.dirname(symlink), { recursive: true });

      fs.symlinkSync(localDependencyLocation, symlink, "junction");

      setupBinScripts(localDependencyLocation, d.name, workspace);
    });
  });
}

function setupBinScripts(
  dependencyLocation: string,
  dependencyName: string,
  workspace: Workspace
) {
  const bin = require(`${dependencyLocation}/package.json`).bin;

  // Install bin
  if (bin) {
    // Implicit script names get calculated from the package name.
    // When the package name is scoped, the bin gets named after the package name without the scope.
    const binName = dependencyName.includes("/")
      ? dependencyName.split("/")[1]
      : dependencyName;
    // bin could be an object (explicit bin names), or a string (implicit bin name)
    const binObject = typeof bin === "object" ? bin : { [binName]: bin };
    fs.mkdirSync(
      path.join(process.cwd(), workspace.location, "node_modules", ".bin"),
      { recursive: true }
    );
    Object.keys(binObject).forEach((b) => {
      const binName = b;
      const binLocation = path.join(dependencyLocation, binObject[b]);
      fs.writeFileSync(
        path.join(
          process.cwd(),
          workspace.location,
          "node_modules",
          ".bin",
          `${binName}`
        ),
        `#!/bin/sh\nnode ${binLocation} "$@"`
      );
      fs.writeFileSync(
        path.join(
          process.cwd(),
          workspace.location,
          "node_modules",
          ".bin",
          `${binName}.cmd`
        ),
        `node ${binLocation} %*`
      );
    });
  }
}

function hidrateYarnLockFile() {
  fs.copyFileSync(
    path.join(process.cwd(), "node_modules", ".store", "yarn.lock"),
    path.join(process.cwd(), "yarn.lock")
  );
}

function cleanNodeModuleFolders() {
  workspaces.forEach((workspace) => {
    const oldNodeModuleFolder = path.join(
      process.cwd(),
      workspace.location,
      "node_modules"
    );
    if (fs.existsSync(oldNodeModuleFolder)) {
      fs.rmdirSync(oldNodeModuleFolder, { recursive: true });
    }
  });
}

function runPostInstallScripts() {
  lifecycleScripts.install &&
    execSync(`yarn run install`, {
      stdio: "inherit",
    });
  lifecycleScripts.postinstall &&
    execSync(`yarn run postinstall`, {
      stdio: "inherit",
    });
  lifecycleScripts.prepare &&
    execSync(`yarn run prepare`, {
      stdio: "inherit",
    });
}

function runYarnInstallInStore() {
  execSync(`npx midgard-yarn install ${process.argv.slice(2).join(" ")}`, {
    stdio: "inherit",
    cwd: path.join(process.cwd(), "node_modules", ".store"),
  });
}

function runPreInstallScript() {
  lifecycleScripts.preinstall &&
    execSync(`yarn run preinstall`, {
      stdio: "inherit",
    });
}

function copyRepoLayoutToStore() {
  fs.mkdirSync(path.join("node_modules", ".store"), { recursive: true });

  // Copy main package.json without lifecycle scripts to the store
  const rootPJ = require(path.join(process.cwd(), "package.json"));
  lifecycleScripts = rootPJ.scripts;
  rootPJ.scripts = {};
  fs.writeFileSync(
    path.join("node_modules", ".store", "package.json"),
    JSON.stringify(rootPJ)
  );

  // Copy lock file to the store
  fs.copyFileSync(
    "yarn.lock",
    path.join("node_modules", ".store", "yarn.lock")
  );

  // Duplicate workspaces layout in the store
  workspaces.forEach((workspace) => {
    if (workspace.name === "yarnWorkspaceAggregator") {
      return;
    }
    fs.mkdirSync(path.join("node_modules", ".store", workspace.location), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(workspace.location, "package.json"),
      path.join("node_modules", ".store", workspace.location, "package.json")
    );
  });
}
