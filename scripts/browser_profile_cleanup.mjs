import fs from "node:fs";

export async function closeBrowserProfile({ client, processHandle, profileDir, keepBrowser = false }) {
  if (keepBrowser) return;

  try {
    if (client) {
      await Promise.race([
        client.send("Browser.close").catch(() => null),
        delay(2_000)
      ]);
    }
  } finally {
    try {
      client?.close();
    } catch {
      // Continue with process and profile cleanup if the socket already closed.
    }
  }

  await waitForExit(processHandle, 5_000);
  if (isRunning(processHandle)) {
    try {
      processHandle.kill();
    } catch {
      // The browser may have exited between the state check and the kill.
    }
    await waitForExit(processHandle, 2_000);
  }

  if (!profileDir) return;
  try {
    fs.rmSync(profileDir, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250
    });
  } catch (error) {
    console.warn(`[browser-profile] Could not remove ${profileDir}: ${error?.message ?? error}`);
  }
}

function isRunning(processHandle) {
  return Boolean(processHandle && processHandle.exitCode == null && processHandle.signalCode == null);
}

async function waitForExit(processHandle, timeoutMs) {
  if (!isRunning(processHandle)) return;
  await Promise.race([
    new Promise((resolve) => processHandle.once("exit", resolve)),
    delay(timeoutMs)
  ]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
