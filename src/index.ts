import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getWorkspaces, Workspace } from "./workspaces";
import * as cmdShim from "@zkochan/cmd-shim";

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

// 5 - Copy yarn.lock back, so changes can be commited
hidrateYarnLockFile();

// 6 - Setup links from the repo to the store
// 7 - Run  post-install scripts
linkRepoNodeModuleFoldersToStore().then(runPostInstallScripts);

async function linkRepoNodeModuleFoldersToStore() {
  await setupDependencyBetweenWorkspaces();
  await setupDependenciesFromExternalToWorkspace();
  await setupExternalDependencies();
}

async function setupExternalDependencies(): Promise<void> {
  return Promise.all(workspaces.map(async (workspace) => {
    const pj = JSON.parse(fs.readFileSync(path.join(
      process.cwd(),
      workspace.location,
      "package.json"
    )).toString());
    const dependencies = new Set(
      [
        ...Object.keys(pj.dependencies || {}),
        ...Object.keys(pj.devDependencies || {}),
      ].filter((n) => !workspace.dependencies.map(w => w.name).includes(n))
    );

    await Promise.all([...dependencies.values()].map(async (d) => {
      const localPath = path.join(process.cwd(), ".yarnStore", workspace.location, "node_modules", d, "package.json");
      const hoistedPath = path.join(process.cwd(), ".yarnStore", "node_modules", d, "package.json");

      const resolvedPath = fs.existsSync(localPath) ? localPath : hoistedPath;

      const resolvedDependency = fs.realpathSync(path.dirname(resolvedPath));

      setupDependencySymlink(workspace, d, resolvedDependency);

      await setupBinScripts(resolvedDependency, d, workspace);
    }));
  })).then(() => {});
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
async function setupDependenciesFromExternalToWorkspace() {
  await Promise.all(workspaces.map(async (workspace) => {
    const localWorkspaceLocation = path.join(process.cwd(), workspace.location);
    const hoistedWorkspaceLocation = path.join(process.cwd(), ".yarnStore", "node_modules", workspace.name);
    try {
    fs.unlinkSync(hoistedWorkspaceLocation)
    fs.symlinkSync(localWorkspaceLocation, hoistedWorkspaceLocation, "junction")
    } catch {}
  }));
}

async function setupDependencyBetweenWorkspaces() {
  await Promise.all(workspaces.map(async (workspace) => {
    await Promise.all(workspace.dependencies.map(async (d) => {
      const localDependencyLocation = path.join(process.cwd(), d.location);
      const symlink = path.join(
        process.cwd(),
        workspace.location,
        "node_modules",
        d.name
      );
      fs.mkdirSync(path.dirname(symlink), { recursive: true });

      fs.symlinkSync(localDependencyLocation, symlink, "junction");

      await setupBinScripts(localDependencyLocation, d.name, workspace);
    }));
  }));
}

function setupBinScripts(
  dependencyLocation: string,
  dependencyName: string,
  workspace: Workspace
): Promise<void> {
  const bin = JSON.parse(fs.readFileSync(`${dependencyLocation}/package.json`).toString()).bin;

  const promises: Promise<any>[] = [];
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
      const binLocation = path.join(dependencyLocation, binObject[binName]);
      if (!fs.existsSync(binLocation)) { return; }

      const shBin = path.join( process.cwd(),
          workspace.location,
          "node_modules",
          ".bin",
          `${binName}`
        );

      promises.push(cmdShim(binLocation, shBin, {}).catch(err => console.error(err)));
    });
  }
  return Promise.all(promises).then(() => {});
}

function hidrateYarnLockFile() {
  fs.copyFileSync(
    path.join(process.cwd(), ".yarnStore", "yarn.lock"),
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
    cwd: path.join(process.cwd(), ".yarnStore"),
  });
}

function runPreInstallScript() {
  lifecycleScripts.preinstall &&
    execSync(`yarn run preinstall`, {
      stdio: "inherit",
    });
}

function copyRepoLayoutToStore() {
  fs.mkdirSync(".yarnStore", { recursive: true });

  // Copy main package.json without lifecycle scripts to the store
  const rootPJ = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json")).toString());
  lifecycleScripts = rootPJ.scripts || {};
  rootPJ.scripts = {};
  fs.writeFileSync(
    path.join(".yarnStore", "package.json"),
    JSON.stringify(rootPJ)
  );

  // Copy lock file to the store
  fs.copyFileSync(
    "yarn.lock",
    path.join(".yarnStore", "yarn.lock")
  );

  // Duplicate workspaces layout in the store
  workspaces.forEach((workspace) => {
    if (workspace.name === "yarnWorkspaceAggregator") {
      return;
    }
    fs.mkdirSync(path.join(".yarnStore", workspace.location), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(workspace.location, "package.json"),
      path.join(".yarnStore", workspace.location, "package.json")
    );
  });
}
