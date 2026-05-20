import { PaintCellChange, Project, ProjectCommand } from "./types";

export function applyProjectCommand(project: Project, command: ProjectCommand) {
  if (command.kind === "paintTiles") return paintTiles(project, command.mapId, command.cells);
  return project;
}

export function projectCommandLabel(command: ProjectCommand) {
  if (command.kind === "paintTiles") return command.cells.length === 1 ? "Paint tile" : `Paint ${command.cells.length} tiles`;
  return command.label;
}

export function projectCommandChangeCount(command: ProjectCommand) {
  if (command.kind === "paintTiles") return command.cells.length;
  return 1;
}

function paintTiles(project: Project, mapId: string, cells: PaintCellChange[]) {
  if (cells.length === 0) return project;
  let projectChanged = false;
  const maps = project.maps.map((map) => {
    if (map.id !== mapId) return map;
    const tiles = [...map.tiles];
    let mapChanged = false;
    for (const cell of cells) {
      if (cell.index < 0 || cell.index >= tiles.length) continue;
      if (tiles[cell.index] === cell.to) continue;
      tiles[cell.index] = cell.to;
      mapChanged = true;
    }
    if (!mapChanged) return map;
    projectChanged = true;
    return { ...map, tiles };
  });
  return projectChanged ? { ...project, maps } : project;
}
