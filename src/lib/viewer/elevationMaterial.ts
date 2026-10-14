// The globe material that tints the survey terrain by height and shades its relief.

import { Cartesian2, Cartesian3, Material, Matrix4, Transforms, type Scene } from "cesium";
import { paintRamp, type ElevationRampId, type ElevationRange } from "@/lib/viewer/elevationRamp";

// Cesium hands the material heights and normals after vertical exaggeration, so both are undone here; 2D's
// near-zero exaggeration would otherwise paint the whole site one colour and flatten the hillshade. The mask
// runs in a local east-north-up frame because the globe has no survey extent of its own.
const SOURCE = `
uniform sampler2D image;
uniform float minimumHeight;
uniform float maximumHeight;
uniform float floorHeight;
uniform float opacity;
uniform bool colors;
uniform bool shading;
uniform float exaggeration;
uniform float relativeHeight;
uniform mat4 enuFromWorld;
uniform vec2 halfExtent;
uniform vec3 towardLight;

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.alpha = 0.0;
    vec4 positionWC = czm_inverseView * vec4(-materialInput.positionToEyeEC, 1.0);
    vec2 local = (enuFromWorld * positionWC).xy;
    float height = (materialInput.height - relativeHeight) / exaggeration + relativeHeight;
    if (any(greaterThan(abs(local), halfExtent)) || height < floorHeight) {
        return material;
    }
    float relief = 1.0;
    if (shading) {
        vec3 normalENU = mat3(enuFromWorld) * (czm_inverseView * vec4(materialInput.normalEC, 0.0)).xyz;
        vec3 normal = normalize(vec3(normalENU.xy / exaggeration, normalENU.z));
        relief = max(dot(normal, towardLight), 0.0) / towardLight.z;
    }
    if (colors) {
        float t = clamp((height - minimumHeight) / (maximumHeight - minimumHeight), 0.0, 1.0);
        vec4 rampColor = czm_gammaCorrect(texture(image, vec2(t, 0.5)));
        material.diffuse = rampColor.rgb * clamp(relief, 0.35, 1.2);
        material.alpha = rampColor.a * opacity;
    } else if (relief < 1.0) {
        material.alpha = (1.0 - relief) * 0.75;
    } else {
        material.diffuse = vec3(1.0);
        material.alpha = (relief - 1.0) * 0.5;
    }
    return material;
}
`;

/** Light from the north-west, 45° up, in east-north-up: the cartographic hillshade convention. */
const TOWARD_LIGHT = Cartesian3.normalize(new Cartesian3(-0.5, 0.5, Math.SQRT1_2), new Cartesian3());

export interface SurveyFrame {
  enuFromWorld: number[];
  halfExtent: Cartesian2;
}

/** The survey's bbox ([west, south, east, north] in degrees) as a box in metres around its centre. */
export function surveyFrame(bbox?: number[]): SurveyFrame | null {
  if (!bbox || bbox.length !== 4) return null;
  const [west, south, east, north] = bbox;
  if (!(west < east && south < north)) return null;
  const center = Cartesian3.fromDegrees((west + east) / 2, (south + north) / 2);
  const fromWorld = Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(center), new Matrix4());
  const halfExtent = new Cartesian2();
  const local = new Cartesian3();
  for (const lon of [west, (west + east) / 2, east]) {
    for (const lat of [south, (south + north) / 2, north]) {
      Matrix4.multiplyByPoint(fromWorld, Cartesian3.fromDegrees(lon, lat), local);
      halfExtent.x = Math.max(halfExtent.x, Math.abs(local.x));
      halfExtent.y = Math.max(halfExtent.y, Math.abs(local.y));
    }
  }
  return { enuFromWorld: Matrix4.toArray(fromWorld), halfExtent };
}

export interface ElevationLook {
  colors: boolean;
  shading: boolean;
  ramp: ElevationRampId;
  range: ElevationRange;
  bands: boolean;
  opacity: number;
  floor: number;
}

function rampCanvas(look: ElevationLook): HTMLCanvasElement {
  const texels = paintRamp(look.ramp, look.range, look.bands);
  const canvas = document.createElement("canvas");
  canvas.width = texels.length / 4;
  canvas.height = 1;
  canvas.getContext("2d")!.putImageData(new ImageData(texels, canvas.width, 1), 0, 0);
  return canvas;
}

const rampKey = (look: ElevationLook) => `${look.ramp}|${look.bands}|${look.range.min}|${look.range.max}`;

/** Holds one material and repaints its ramp only when the colours it encodes change. */
export class ElevationMaterial {
  readonly material: Material;
  private rampKey = "";

  constructor(frame: SurveyFrame, look: ElevationLook) {
    this.material = new Material({
      fabric: {
        uniforms: {
          image: rampCanvas(look),
          minimumHeight: look.range.min,
          maximumHeight: look.range.max,
          floorHeight: look.floor,
          opacity: look.opacity,
          colors: look.colors,
          shading: look.shading,
          exaggeration: 1,
          relativeHeight: 0,
          enuFromWorld: frame.enuFromWorld,
          halfExtent: frame.halfExtent,
          towardLight: TOWARD_LIGHT,
        },
        source: SOURCE,
      },
      translucent: true,
    });
    this.rampKey = rampKey(look);
  }

  update(frame: SurveyFrame, look: ElevationLook): void {
    const u = this.material.uniforms;
    u.minimumHeight = look.range.min;
    u.maximumHeight = look.range.max;
    u.floorHeight = look.floor;
    u.opacity = look.opacity;
    u.colors = look.colors;
    u.shading = look.shading;
    u.enuFromWorld = frame.enuFromWorld;
    u.halfExtent = frame.halfExtent;
    const key = rampKey(look);
    if (key !== this.rampKey) {
      u.image = rampCanvas(look);
      this.rampKey = key;
    }
  }

  /** Copies the scene's vertical exaggeration in, for the shader to undo. */
  syncExaggeration(scene: Scene): void {
    const u = this.material.uniforms;
    u.exaggeration = Math.max(scene.verticalExaggeration, 1e-6);
    u.relativeHeight = scene.verticalExaggerationRelativeHeight;
  }

  destroy(): void {
    this.material.destroy();
  }
}
