import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SimulationReport } from "../agent/simulate";
import type { RunStore } from "./index";

const DIR = path.join(process.cwd(), "data");
const LATEST = path.join(DIR, "simulation.json");

export function fileStore(): RunStore {
  return {
    kind: "file",
    async saveReport(report) {
      await mkdir(DIR, { recursive: true });
      await writeFile(LATEST, JSON.stringify(report, null, 2), "utf8");
      const stamped = path.join(DIR, `run-${report.generatedAt.replace(/[:.]/g, "-")}.json`);
      await writeFile(stamped, JSON.stringify(report, null, 2), "utf8");
    },
    async loadLatest() {
      try {
        return JSON.parse(await readFile(LATEST, "utf8")) as SimulationReport;
      } catch {
        return null;   // no run yet is a normal state, not an error
      }
    },
  };
}
