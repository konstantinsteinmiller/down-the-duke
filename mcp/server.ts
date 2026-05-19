import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod";
import {promises as fs} from "node:fs";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.GDEVELOP_PROJECT_ROOT
  ? path.resolve(process.env.GDEVELOP_PROJECT_ROOT)
  : path.resolve(HERE, "..");
const GAME_JSON = path.join(PROJECT_ROOT, "Project", "game.json");
const GDEXPORT_CLI = path.join(PROJECT_ROOT, "node_modules", "gdexporter", "bin", "cli");

type GameJson = {
  properties?: Record<string, unknown>;
  resources?: { resources?: Array<Record<string, unknown>> };
  objects?: Array<Record<string, unknown>>;
  layouts?: Array<Record<string, unknown>>;
  eventsFunctionsExtensions?: Array<Record<string, unknown>>;
  usedExtensions?: Array<Record<string, unknown>>;
};

async function loadGameJson(): Promise<GameJson> {
  try {
    const raw = await fs.readFile(GAME_JSON, "utf8");
    return JSON.parse(raw) as GameJson;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(
        `No game.json found at ${GAME_JSON}. Open GDevelop, create a new project, and save it as Project/game.json under ${PROJECT_ROOT}.`,
      );
    }
    throw new Error(`Failed to read or parse game.json: ${err.message}`);
  }
}

async function saveGameJson(g: GameJson): Promise<void> {
  const formatted = JSON.stringify(g, null, 2) + "\n";
  await fs.writeFile(GAME_JSON, formatted, "utf8");
}

function findScene(g: GameJson, name: string): Record<string, unknown> | undefined {
  return (g.layouts ?? []).find((l) => (l as Record<string, unknown>).name === name) as
    | Record<string, unknown>
    | undefined;
}

function uuid(): string {
  return randomUUID();
}

function textResult(payload: unknown) {
  return {
    content: [
      {type: "text" as const, text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)},
    ],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{type: "text" as const, text: message}],
  };
}

const server = new McpServer({
  name: "gdevelop",
  version: "0.1.0",
});

server.registerTool(
  "get_project_info",
  {
    title: "Get GDevelop project info",
    description: "Return high-level properties of the GDevelop project (Project/game.json): name, version, author, package name, window size, plus scene/object/resource/extension counts.",
    inputSchema: {},
  },
  async () => {
    try {
      const g = await loadGameJson();
      const props = (g.properties ?? {}) as Record<string, unknown>;
      return textResult({
        name: props.name,
        version: props.version,
        author: props.author,
        packageName: props.packageName,
        orientation: props.orientation,
        windowWidth: props.windowWidth,
        windowHeight: props.windowHeight,
        sceneCount: (g.layouts ?? []).length,
        globalObjectCount: (g.objects ?? []).length,
        resourceCount: (g.resources?.resources ?? []).length,
        customExtensionCount: (g.eventsFunctionsExtensions ?? []).length,
        usedExtensions: g.usedExtensions ?? [],
      });
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

server.registerTool(
  "list_scenes",
  {
    title: "List scenes (layouts)",
    description: "List all scenes in the GDevelop project with object, instance, and layer counts.",
    inputSchema: {},
  },
  async () => {
    try {
      const g = await loadGameJson();
      const scenes = (g.layouts ?? []).map((l) => {
        const layout = l as Record<string, unknown>;
        return {
          name: layout.name,
          objectCount: ((layout.objects as unknown[]) ?? []).length,
          instanceCount: ((layout.instances as unknown[]) ?? []).length,
          layerCount: ((layout.layers as unknown[]) ?? []).length,
        };
      });
      return textResult(scenes);
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

server.registerTool(
  "get_scene",
  {
    title: "Get scene details",
    description: "Return a single scene's objects, instances, and layers. Events are excluded — they can be very large; ask explicitly for them via the file system if needed.",
    inputSchema: {name: z.string().describe("Scene (layout) name")},
  },
  async ({name}) => {
    try {
      const g = await loadGameJson();
      const scene = (g.layouts ?? []).find((l) => (l as Record<string, unknown>).name === name) as
        | Record<string, unknown>
        | undefined;
      if (!scene) {
        const available = (g.layouts ?? []).map((l) => (l as Record<string, unknown>).name).join(", ");
        return errorResult(`Scene "${name}" not found. Available: ${available || "(none)"}`);
      }
      return textResult({
        name: scene.name,
        objects: ((scene.objects as Array<Record<string, unknown>>) ?? []).map((o) => ({
          name: o.name,
          type: o.type,
        })),
        instances: ((scene.instances as Array<Record<string, unknown>>) ?? []).map((i) => ({
          name: i.name,
          x: i.x,
          y: i.y,
          zOrder: i.zOrder,
          layer: i.layer,
        })),
        layers: ((scene.layers as Array<Record<string, unknown>>) ?? []).map((l) => ({
          name: l.name,
          visibility: l.visibility,
        })),
      });
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

server.registerTool(
  "list_objects",
  {
    title: "List objects",
    description: "List all objects (global + per scene). Optionally restrict to a single scene by name.",
    inputSchema: {
      scene: z.string().optional().describe("Scene name to restrict to (omit for global + all scenes)"),
    },
  },
  async ({scene}) => {
    try {
      const g = await loadGameJson();
      const out: Record<string, Array<{ name: unknown; type: unknown }>> = {
        __global__: (g.objects ?? []).map((o) => ({
          name: (o as Record<string, unknown>).name,
          type: (o as Record<string, unknown>).type,
        })),
      };
      if (scene) {
        const s = (g.layouts ?? []).find((l) => (l as Record<string, unknown>).name === scene) as
          | Record<string, unknown>
          | undefined;
        if (!s) return errorResult(`Scene "${scene}" not found.`);
        out[scene] = ((s.objects as Array<Record<string, unknown>>) ?? []).map((o) => ({
          name: o.name,
          type: o.type,
        }));
      } else {
        for (const l of g.layouts ?? []) {
          const layout = l as Record<string, unknown>;
          out[String(layout.name)] = ((layout.objects as Array<Record<string, unknown>>) ?? []).map((o) => ({
            name: o.name,
            type: o.type,
          }));
        }
      }
      return textResult(out);
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

server.registerTool(
  "list_resources",
  {
    title: "List resources",
    description: "List project resources (images, audio, fonts, etc.). Optionally filter by kind.",
    inputSchema: {
      kind: z
        .enum([
          "image",
          "audio",
          "font",
          "video",
          "json",
          "bitmapFont",
          "model3D",
          "atlas",
          "spine",
          "tilemap",
          "javascript",
        ])
        .optional()
        .describe("Filter to a single resource kind"),
    },
  },
  async ({kind}) => {
    try {
      const g = await loadGameJson();
      let rs = (g.resources?.resources ?? []) as Array<Record<string, unknown>>;
      if (kind) rs = rs.filter((r) => r.kind === kind);
      return textResult(
        rs.map((r) => ({name: r.name, kind: r.kind, file: r.file})),
      );
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

server.registerTool(
  "list_extensions",
  {
    title: "List extensions",
    description: "List GDevelop extensions used by the project, plus any custom event-function extensions defined inside it.",
    inputSchema: {},
  },
  async () => {
    try {
      const g = await loadGameJson();
      return textResult({
        used: g.usedExtensions ?? [],
        custom: (g.eventsFunctionsExtensions ?? []).map((e) => {
          const ext = e as Record<string, unknown>;
          return {name: ext.name, fullName: ext.fullName, version: ext.version};
        }),
      });
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

server.registerTool(
  "export_web",
  {
    title: "Export to web (HTML5)",
    description: "Run gdexporter to export the GDevelop project to an HTML5 web bundle. Synchronous — returns once the export finishes (typically 10–60s depending on project size and whether the GDJS runtime needs downloading).",
    inputSchema: {
      outDir: z.string().optional().describe("Output directory relative to project root (default: ./dist)"),
      verbose: z.boolean().optional().describe("Enable GDCore verbose logging (default: false)"),
    },
  },
  async ({outDir, verbose}) => {
    const resolvedOut = path.resolve(PROJECT_ROOT, outDir ?? "./dist");
    const args = [GDEXPORT_CLI, "--project", GAME_JSON, "--out", resolvedOut];
    if (verbose) args.push("--verbose");

    return await new Promise((resolve) => {
      const proc = spawn(process.execPath, args, {cwd: PROJECT_ROOT});
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      proc.on("error", (err) => {
        resolve(errorResult(`Failed to spawn gdexport: ${err.message}`));
      });
      proc.on("close", (code) => {
        const summary = `gdexport exit code: ${code}\nOutput directory: ${resolvedOut}\n\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`;
        resolve(code === 0 ? textResult(summary) : errorResult(summary));
      });
    });
  },
);

server.registerTool(
  "set_event_js",
  {
    title: "Set the JS code event of a scene",
    description: "Replace ALL existing JsCode events in the named scene with a single JsCode event containing the provided code. Use this as the single source of truth for in-scene game logic. The code runs once per frame (it's placed at the top of the scene's events list).",
    inputSchema: {
      scene: z.string().describe("Scene (layout) name"),
      code: z.string().describe("JavaScript source to embed. Has access to GDevelop runtime variables: runtimeScene, eventsFunctionContext."),
    },
  },
  async ({scene, code}) => {
    try {
      const g = await loadGameJson();
      const s = findScene(g, scene);
      if (!s) {
        const available = (g.layouts ?? []).map((l) => (l as Record<string, unknown>).name).join(", ");
        return errorResult(`Scene "${scene}" not found. Available: ${available || "(none)"}`);
      }
      const events = (s.events as Array<Record<string, unknown>>) ?? [];
      const kept = events.filter((e) => e.type !== "BuiltinCommonInstructions::JsCode");
      const jsEvent = {
        type: "BuiltinCommonInstructions::JsCode",
        inlineCode: code,
        parameterObjects: "",
        useStrict: true,
        eventsSheetExpanded: true,
      };
      s.events = [jsEvent, ...kept];
      await saveGameJson(g);
      return textResult(`Replaced ${events.length - kept.length} JsCode event(s) in "${scene}" with new code (${code.length} chars).`);
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

server.registerTool(
  "add_object",
  {
    title: "Add an object to a scene",
    description: "Insert an object definition (Sprite, ShapePainter, TextObject, etc.) into a named scene. For Sprite objects, optionally provide one animation referencing existing image resource names. Returns an error if an object with the same name already exists in the scene.",
    inputSchema: {
      scene: z.string().describe("Scene (layout) name"),
      name: z.string().describe("Object name — must be unique within the scene"),
      type: z
        .enum([
          "Sprite",
          "PrimitiveDrawing::Drawer",
          "TextObject::Text",
          "TiledSpriteObject::TiledSprite",
        ])
        .describe("GDevelop object type"),
      spriteResources: z
        .array(z.string())
        .optional()
        .describe("For Sprite: names of image resources to use as frames of a single default animation"),
    },
  },
  async ({scene, name, type, spriteResources}) => {
    try {
      const g = await loadGameJson();
      const s = findScene(g, scene);
      if (!s) return errorResult(`Scene "${scene}" not found.`);
      const objects = (s.objects as Array<Record<string, unknown>>) ?? [];
      if (objects.find((o) => o.name === name)) {
        return errorResult(`Object "${name}" already exists in scene "${scene}".`);
      }
      const base: Record<string, unknown> = {
        assetStoreId: "",
        name,
        persistentUuid: uuid(),
        type,
        updateIfNotVisible: false,
        variables: [],
        effects: [],
        behaviors: [],
      };
      if (type === "Sprite") {
        base.adaptCollisionMaskAutomatically = true;
        const frames = (spriteResources ?? []).map((resName) => ({
          hasCustomCollisionMask: false,
          image: resName,
          points: [],
          originPoint: {name: "origine", x: 0, y: 0},
          centerPoint: {automatic: true, name: "centre", x: 0, y: 0},
          customCollisionMask: [],
        }));
        base.animations = (spriteResources ?? []).length
          ? [
            {
              name: "default",
              useMultipleDirections: false,
              directions: [
                {
                  looping: false,
                  timeBetweenFrames: 0.08,
                  sprites: frames,
                },
              ],
            },
          ]
          : [];
      } else if (type === "PrimitiveDrawing::Drawer") {
        base.fillColor = {b: 200, g: 200, r: 200};
        base.outlineColor = {b: 255, g: 255, r: 255};
        base.fillOpacity = 255;
        base.outlineOpacity = 255;
        base.outlineSize = 1;
        base.absoluteCoordinates = false;
        base.clearBetweenFrames = true;
        base.antialiasing = false;
      } else if (type === "TextObject::Text") {
        base.bold = false;
        base.italic = false;
        base.underlined = false;
        base.smoothed = true;
        base.characterSize = 20;
        base.color = {b: 255, g: 255, r: 255};
        base.font = "";
        base.string = "";
        base.textAlignment = "left";
        base.verticalTextAlignment = "top";
      }
      objects.push(base);
      s.objects = objects;
      const fs_struct = (s.objectsFolderStructure as Record<string, unknown>) ?? {
        folderName: "__ROOT",
      };
      const children = ((fs_struct.children as Array<Record<string, unknown>>) ?? []).slice();
      children.push({objectName: name});
      fs_struct.children = children;
      s.objectsFolderStructure = fs_struct;
      await saveGameJson(g);
      return textResult(`Added ${type} "${name}" to scene "${scene}".`);
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

server.registerTool(
  "add_resource",
  {
    title: "Add a resource to the project",
    description: "Register an image/audio/font resource in game.json. The file must already exist at the given path (relative to Project/). Returns an error if a resource with the same name already exists.",
    inputSchema: {
      name: z.string().describe("Resource name used to reference it from objects/animations"),
      file: z.string().describe("Path to the asset, relative to the Project/ directory (e.g. assets/player.png)"),
      kind: z
        .enum(["image", "audio", "font", "video", "json", "bitmapFont", "model3D", "atlas", "spine", "tilemap", "javascript"])
        .describe("Resource kind"),
    },
  },
  async ({name, file, kind}) => {
    try {
      const projectDir = path.dirname(GAME_JSON);
      const fullPath = path.join(projectDir, file);
      try {
        await fs.access(fullPath);
      } catch {
        return errorResult(`File not found: ${fullPath}`);
      }
      const g = await loadGameJson();
      const resources = (g.resources?.resources ?? []) as Array<Record<string, unknown>>;
      if (resources.find((r) => r.name === name)) {
        return errorResult(`Resource "${name}" already exists.`);
      }
      const resource: Record<string, unknown> = {
        alwaysLoaded: false,
        file: file.replace(/\\/g, "/"),
        kind,
        metadata: "",
        name,
        userAdded: true,
      };
      if (kind === "image") {
        resource.smoothed = true;
      }
      resources.push(resource);
      if (!g.resources) g.resources = {resources: []};
      g.resources.resources = resources;
      await saveGameJson(g);
      return textResult(`Added ${kind} resource "${name}" -> ${file}`);
    } catch (e) {
      return errorResult((e as Error).message);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
