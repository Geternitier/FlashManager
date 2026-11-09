import { invoke, isTauri } from "@tauri-apps/api/core";

async function start() {
  const shell = document.querySelector(".fm-startup");
  if (isTauri() && shell?.getBoundingClientRect().height) {
    await invoke("show_startup_window").catch((error) => {
      console.warn("Could not show the startup window immediately", error);
    });

    // Allow a frame to paint the shell before React replaces it.
    await Promise.race([
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
    ]);
  }

  await import("./main");
}

void start().catch((error) => {
  console.error("Could not load the dashboard", error);
  const status = document.querySelector(".fm-startup [role='status']");
  if (status) status.textContent = "主界面加载失败，请关闭窗口后重试。";
});
