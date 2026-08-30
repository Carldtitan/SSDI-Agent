/* eslint-disable @typescript-eslint/no-require-imports */
const { app } = require("electron");
const { createWindowsControl } = require("../desktop/windows-control.cjs");

async function verify() {
  await app.whenReady();
  const control = createWindowsControl({ emit() {} });
  // This smoke check is intentionally read-only: it must not open apps, type,
  // or interrupt the person's current Windows session.
  const observation = await control.observe();
  const result = JSON.stringify({
    activeWindow: observation.activeWindow,
    elementCount: observation.elements.length,
    accessibilityDescriptionsCaptured: observation.elements.length >= 0,
  });
  process.stdout.write(result);
  app.exit(0);
  process.exit(0);
}

verify().catch((error) => {
  process.stderr.write(error instanceof Error ? error.stack || error.message : String(error));
  app.exit(1);
  process.exit(1);
});
