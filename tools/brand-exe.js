// Puts the HQ OS icon and name into node_modules/electron/dist/electron.exe, so the taskbar, pins and
// Task Manager show HQ OS instead of Electron. Runs after every npm install (an Electron reinstall resets the exe).
const path = require("path");
const exe = path.join(__dirname, "..", "node_modules", "electron", "dist", "electron.exe");
require("rcedit")(exe, { icon: path.join(__dirname, "..", "renderer", "icon.ico"), "version-string": { FileDescription: "HQ OS", ProductName: "HQ OS", CompanyName: "Hayden Howell" } })
  .then(() => console.log("HQ OS icon applied to electron.exe"))
  .catch((e) => console.warn("brand-exe skipped (close HQ OS first):", e.message));
