import { join } from "https://deno.land/std@0.148.0/path/mod.ts";
// https://substance3d.adobe.com/documentation/spdoc/remote-control-with-scripting-216629326.html
// "Adobe Substance 3D painter.exe" --enable-remote-scripting

const appData = Deno.env.get("APPDATA") || "%AppData%";
const localAppData = Deno.env.get("LOCALAPPDATA") || "%LocalAppData%";

const comMojang = join(
	localAppData,
	"Packages",
	"Microsoft.MinecraftUWP_8wekyb3d8bbwe",
	"LocalState",
	"games",
	"com.mojang",
);

const dotMinecraft = join(appData, ".minecraft", "resourcepacks");

// const devBehaviorPacks = join(
//   comMojang,
//   "development_behavior_packs"
// );
// const devResourcePacks = join(
//   comMojang,
//   "development_resource_packs"
// );
