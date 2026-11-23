// Bundled into renderer/vendor/nebula-lib.js by: npm run build:nebula (esbuild, IIFE, one shared three instance).
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
window.NebulaLib = { ForceGraph3D, THREE, UnrealBloomPass, EffectComposer, RenderPass, OutputPass };
