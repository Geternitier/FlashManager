import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind } from "typescript";

const source = readFileSync(new URL("../src/serviceArgs.ts", import.meta.url), "utf8");
const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext } });
const { parseServiceArgs } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const args = ["--name", "hello world", "C:\\Program Files\\My Service\\", "", 'a"b', "中文", "line\nbreak"];
assert.deepEqual(parseServiceArgs(JSON.stringify(args, null, 2)), args);
assert.deepEqual(parseServiceArgs(""), []);
for (const invalid of ['"hello"', "[1]", "[null]", "{}", "--port 80"]) {
  assert.throws(() => parseServiceArgs(invalid));
}
console.log("Argument round-trip and invalid input tests passed.");
