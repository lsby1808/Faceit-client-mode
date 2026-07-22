import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixtureRoot = resolve(process.cwd(), "fixtures");

export function loadFixture(name: string): void {
  document.body.innerHTML = readFileSync(resolve(fixtureRoot, `${name}.html`), "utf8");
}
