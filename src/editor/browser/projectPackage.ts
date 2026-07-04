import { Project } from "../types";
import { createStoredZip } from "./zip";

export function browserProjectPackageFileName(project: Project) {
  return `${safePackageName(project.scenario.name || "Untitled Scenario")}.providence.zip`;
}

export function createBrowserProjectPackageZip(project: Project) {
  const rootName = `${safePackageName(project.scenario.name || "Untitled Scenario")}.providence`;
  const projectJson = new TextEncoder().encode(`${JSON.stringify(project, null, 2)}\n`);
  return createStoredZip([
    {
      path: `${rootName}/project.json`,
      bytes: projectJson,
      modifiedAt: new Date()
    }
  ]);
}

function safePackageName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Untitled Scenario";
}
