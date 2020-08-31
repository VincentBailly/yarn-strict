import { execSync } from "child_process";
import * as path from "path";

export type Workspace = {
  location: string;
  name: string;
  dependencies: Workspace[];
};

export function getWorkspaces(): Workspace[] {
  const raw: {
    [key: string]: { location: string; workspaceDependencies: string[] };
  } = JSON.parse(
    JSON.parse(execSync(`yarn --silent --json workspaces info`).toString()).data
  );

  const result: Workspace[] = [];
  const invertedResult: { [key: string]: number } = {};
  Object.keys(raw).forEach((k, i) => {
    result.push({
      name: k,
      location: raw[k].location,
      dependencies: [],
    });
    invertedResult[k] = i;
  });

  Object.keys(raw).forEach((k, i) =>
    result[i].dependencies.push(
      ...raw[k].workspaceDependencies.map((n) => result[invertedResult[n]])
    )
  );

  const aggregatorPJ = require(path.join(process.cwd(), "package.json"));
  const localDependencies = [
    ...new Set(
      [
        ...Object.keys(aggregatorPJ.dependencies || {}),
        ...Object.keys(aggregatorPJ.devDependencies || {}),
      ].filter((n) => Object.keys(raw).indexOf(n) !== -1)
    ).values(),
  ];
  result.push({
    name: "yarnWorkspaceAggregator",
    location: ".",
    dependencies: localDependencies.map((n) => result[invertedResult[n]]),
  });
  return result;
}
