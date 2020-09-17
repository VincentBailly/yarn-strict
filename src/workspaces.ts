import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

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
    {
      result[i].dependencies.push(
        ...raw[k].workspaceDependencies.map((n) => result[invertedResult[n]])
      )
      result[i].dependencies.push(result[i]);
    }
  );

  const aggregatorPJ = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json")).toString());
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
