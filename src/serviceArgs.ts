export function parseServiceArgs(text: string): string[] {
  if (!text.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('启动参数需要是 JSON 字符串数组，例如 ["--name", "hello world"]。'); }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("启动参数必须是字符串数组，每一项对应一个参数。");
  }
  return value;
}
