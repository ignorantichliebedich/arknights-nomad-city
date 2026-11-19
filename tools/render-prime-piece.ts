import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import type { Plugin } from "vite";

type Vec = [number, number, number];
type Plane = { normal: Vec; offset: number };
type Hit = { plane: Plane; distance: number };

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (v: Vec, n: number): Vec => [v[0] * n, v[1] * n, v[2] * n];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const difference = (a: Vec, b: Vec) => add(a, scale(b, -1));
const unit = (v: Vec) => scale(v, 1 / Math.sqrt(dot(v, v)));
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const reflect = (ray: Vec, normal: Vec) =>
  add(ray, scale(normal, -2 * dot(ray, normal)));

function readPlanes(obj: string) {
  const vertices: Vec[] = [];
  const planes: Plane[] = [];
  for (const line of obj.split(/\r?\n/)) {
    const [kind, ...fields] = line.trim().split(/\s+/);
    if (kind === "v") vertices.push(fields.map(Number) as Vec);
    if (kind === "f") {
      const [a, b, c] = fields.slice(0, 3).map((field) => {
        const index = Number(field.split("/")[0]);
        return Number.isInteger(index) && index !== 0
          ? vertices.at(index < 0 ? index : index - 1)
          : undefined;
      });
      if (!a || !b || !c) throw new Error("至纯源石网格的切面缺少顶点");
      const normal = unit(cross(difference(b, a), difference(c, a)));
      planes.push({ normal, offset: dot(normal, a) });
    }
  }
  if (!planes.length) throw new Error("至纯源石网格没有可渲染的切面");
  return planes;
}

// Each face bounds a convex half-space. Their shared interval is the part of the ray in the stone.
function boundary(
  origin: Vec,
  ray: Vec,
  planes: Plane[],
  inside = false,
): Hit | undefined {
  let entry = -Infinity,
    exit = Infinity;
  let near: Plane | undefined, far: Plane | undefined;
  for (const plane of planes) {
    const denominator = dot(plane.normal, ray);
    const gap = plane.offset - dot(plane.normal, origin);
    if (Math.abs(denominator) < 1e-8) {
      if (gap < -1e-6) return;
      continue;
    }
    const t = gap / denominator;
    if (denominator < 0 && t > entry) {
      entry = t;
      near = plane;
    }
    if (denominator > 0 && t < exit) {
      exit = t;
      far = plane;
    }
    if (entry > exit) return;
  }
  if (inside && far && exit > 0) return { plane: far, distance: exit };
  if (!inside && near && entry > 0) return { plane: near, distance: entry };
}

function refract(ray: Vec, normal: Vec, ratio: number) {
  const cosine = -dot(ray, normal);
  const k = 1 - ratio * ratio * (1 - cosine * cosine);
  if (k < 0) return;
  return add(scale(ray, ratio), scale(normal, ratio * cosine - Math.sqrt(k)));
}

const softbox = unit([-0.75, -1.25, 1.8]);
const rim = unit([1.1, 0.6, 1.0]);
function studio(ray: Vec): Vec {
  if (ray[2] < 0) {
    const bounce = 0.55 - ray[2] * 0.32;
    return [bounce, bounce * 0.85, bounce * 0.63];
  }
  const key = Math.max(0, Math.min(1, (dot(ray, softbox) - 0.53) * 5.5));
  const edge = Math.max(0, Math.min(1, (dot(ray, rim) - 0.73) * 13));
  // A strip of reflected paper along the crown makes the polished bevel visible at table scale.
  const strip =
    ray[1] > 0.22
      ? Math.max(0, 1 - Math.abs(ray[0] / ray[1] + 0.68) * 15) *
        Math.min(1, ray[2] * 4)
      : 0;
  return [
    0.14 + key * 1.72 + edge * 1.22 + strip * 2.8 + strip ** 4 * 13,
    0.12 + key * 1.64 + edge + strip * 2.6 + strip ** 4 * 12,
    0.13 + key * 1.5 + edge * 0.81 + strip * 2.4 + strip ** 4 * 11,
  ];
}

function glass(
  origin: Vec,
  ray: Vec,
  hit: Hit,
  planes: Plane[],
  transmission: Vec,
  index: number,
): Vec {
  const normal = hit.plane.normal;
  let point = add(origin, scale(ray, hit.distance));
  const f0 = ((1 - index) / (1 + index)) ** 2;
  const fresnel = (cosine: number) =>
    f0 + (1 - f0) * (1 - Math.abs(cosine)) ** 5;
  const reflection = fresnel(dot(ray, normal));
  const light = scale(studio(reflect(ray, normal)), reflection);
  let direction = refract(ray, normal, 1 / index)!;
  const power: Vec = [1 - reflection, 1 - reflection, 1 - reflection];
  // Light can reflect internally before escaping through a different facet.
  for (let bounce = 0; bounce < 5; bounce++) {
    const next = boundary(point, direction, planes, true);
    if (!next) break;
    point = add(point, scale(direction, next.distance));
    const outside = refract(direction, scale(next.plane.normal, -1), index);
    const reflectance = outside
      ? fresnel(dot(direction, next.plane.normal))
      : 1;
    const environment = outside ? studio(outside) : [0, 0, 0];
    for (let channel = 0; channel < 3; channel++) {
      power[channel] *= transmission[channel] ** next.distance;
      light[channel] +=
        power[channel] * (1 - reflectance) * environment[channel];
      power[channel] *= reflectance;
    }
    if (Math.max(...power) < 0.008) break;
    direction = reflect(direction, next.plane.normal);
  }
  return add(light, [0.015, 0.004, 0.001]);
}

function chunk(name: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(name, "ascii"), data]);
  const block = Buffer.alloc(8 + body.length);
  block.writeUInt32BE(data.length, 0);
  body.copy(block, 4);
  block.writeUInt32BE(crc32(body), 4 + body.length);
  return block;
}

export function renderPrimePiece(obj: string, mtl: string) {
  const planes = readPlanes(obj);
  const transmission = /^Tf (.+)$/m
    .exec(mtl)![1]
    .trim()
    .split(/\s+/)
    .map(Number) as Vec;
  const index = Number(/^Ni (.+)$/m.exec(mtl)![1]);
  const width = 144,
    height = 120;
  const bytes = Buffer.alloc((width * 4 + 1) * height);
  const view = unit([2.9, -4.9, 3.4]);
  const right = unit(cross([0, 0, 1], view)),
    up = cross(view, right);
  const target: Vec = [0, 0, 0.52];
  const eye = add(target, scale(view, 10));
  const samples = [
    [0.25, 0.125],
    [0.875, 0.375],
    [0.125, 0.625],
    [0.625, 0.875],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rgb: Vec = [0, 0, 0];
      let alpha = 0;
      for (const [dx, dy] of samples) {
        const u = ((x + dx - width / 2) * 3) / width;
        const v = ((height / 2 - y - dy) * 3) / width;
        const ray = unit(
          difference(add(target, add(scale(right, u), scale(up, v))), eye),
        );
        const hit = boundary(eye, ray, planes);
        if (hit) {
          const light = glass(eye, ray, hit, planes, transmission, index);
          for (let i = 0; i < 3; i++) rgb[i] += light[i];
          alpha++;
        } else {
          const floor = add(eye, scale(ray, -eye[2] / ray[2]));
          const shadow =
            0.3 *
            Math.exp(-1.8 * ((floor[0] - 0.18) ** 2 + (floor[1] - 0.2) ** 2));
          alpha += shadow;
          rgb[0] += 0.055 * shadow;
          rgb[1] += 0.031 * shadow;
          rgb[2] += 0.018 * shadow;
        }
      }
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) {
        const linear = Math.min(1, rgb[i] / (alpha || 1));
        const srgb =
          linear < 0.0031308
            ? 12.92 * linear
            : 1.055 * linear ** (1 / 2.4) - 0.055;
        bytes[offset + i] = Math.round(srgb * 255);
      }
      bytes[offset + 3] = Math.round((255 * alpha) / samples.length);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(bytes, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Render the editable mesh once per build; every wallet shares a single small image. */
export function primePieceAsset(): Plugin {
  let production = false;
  return {
    name: "nomad-prime-piece",
    enforce: "pre",
    configResolved(config) {
      production = config.command === "build";
    },
    load(id) {
      if (!id.endsWith("/originium-prime.obj?piece")) return;
      const mesh = id.split("?")[0];
      const material = join(dirname(mesh), "originium-prime.mtl");
      this.addWatchFile(mesh);
      this.addWatchFile(material);
      const png = renderPrimePiece(
        readFileSync(mesh, "utf8"),
        readFileSync(material, "utf8"),
      );
      if (!production)
        return `export default "data:image/png;base64,${png.toString("base64")}"`;
      const file = this.emitFile({
        type: "asset",
        name: "originium-prime.png",
        source: png,
      });
      return `export default import.meta.ROLLUP_FILE_URL_${file}`;
    },
  };
}
