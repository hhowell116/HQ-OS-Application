// electron-builder afterPack: put the HQ OS icon and name into the exe (signAndEditExecutable is off to avoid the winCodeSign download).
const path = require("path");
exports.default = async function (ctx) {
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + ".exe");
  await require("rcedit")(exe, { icon: path.join(ctx.packager.projectDir, "renderer", "icon.ico"), "version-string": { FileDescription: "HQ OS", ProductName: "HQ OS", CompanyName: "HQ OS", OriginalFilename: "HQ OS.exe", InternalName: "HQ OS" } });
};
