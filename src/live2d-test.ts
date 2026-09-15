import { CubismFramework } from './live2d-sdk/framework/live2dcubismframework';
import { CubismUserModel } from './live2d-sdk/framework/model/cubismusermodel';
import { CubismPhysics } from './live2d-sdk/framework/physics/cubismphysics';
import { CubismEyeBlink } from './live2d-sdk/framework/effect/cubismeyeblink';
import { CubismModelSettingJson } from './live2d-sdk/framework/cubismmodelsettingjson';
import { CubismMatrix44 } from './live2d-sdk/framework/math/cubismmatrix44';
import { getRealtimeMouthLevel, getRealtimeOutputRms } from './live2d-realtime';

const base = '/live2d/kei/';
const file = 'ワーク_kei_live2d.model3.json';

async function getBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function getTexture(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function startLive2DTest(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#live2d')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const metrics = document.querySelector<HTMLOutputElement>('#metrics')!;
  let stage = '開始';
  try {
    if (!('Live2DCubismCore' in window)) throw new Error('Cubism Core R5 を読み込めませんでした');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL を使用できません');
    CubismFramework.startUp();
    CubismFramework.initialize();
    stage = 'model3.json';

    const settingsBuffer = await getBuffer(base + file);
    const settings = new CubismModelSettingJson(settingsBuffer, settingsBuffer.byteLength);
    const model = new CubismUserModel();
    stage = 'moc3';
    model.loadModel(await getBuffer(base + settings.getModelFileName()));
    const cubism = model.getModel();
    if (!cubism) throw new Error('moc3 を読み込めませんでした');

    let physics: CubismPhysics | undefined;
    stage = 'physics3.json';
    if (settings.getPhysicsFileName()) {
      const buffer = await getBuffer(base + settings.getPhysicsFileName());
      physics = CubismPhysics.create(buffer, buffer.byteLength);
    }
    const blink = settings.getEyeBlinkParameterCount() > 0 ? CubismEyeBlink.create(settings) : undefined;
    stage = 'パラメータ';
    const displayInfo = JSON.parse(new TextDecoder().decode(await getBuffer(base + 'ワーク_kei_live2d.cdi3.json')));
    const displayIds = new Set<string>(displayInfo.Parameters.map((entry: { Id: string }) => entry.Id));
    function parameter(name: string) {
      if (!displayIds.has(name)) throw new Error(`${name} は cdi3.json にありません`);
      const id = CubismFramework.getIdManager().getId(name);
      const index = cubism.getParameterIndex(id);
      if (index < 0 || index >= cubism.getParameterCount() || cubism.getParameterId(index) !== id) {
        throw new Error(`${name} は moc3 にありません`);
      }
      return {
        name, index,
        min: cubism.getParameterMinimumValue(index),
        max: cubism.getParameterMaximumValue(index),
        initial: cubism.getParameterDefaultValue(index),
      };
    }
    const breath = parameter('ParamBreath');
    const angle = parameter('ParamAngleZ');
    const body = parameter('ParamBodyAngleX');
    const hair = parameter('ParamHairSide');
    const mouth = parameter('ParamMouthOpenY');
    const targets = [breath, angle, body, hair, mouth];
    const physicsData = JSON.parse(new TextDecoder().decode(await getBuffer(base + settings.getPhysicsFileName())));
    const physicsSetting = physicsData.PhysicsSettings.find((entry: { Input: { Source: { Id: string } }[]; Output: { Destination: { Id: string } }[] }) =>
      entry.Input.some(input => input.Source.Id === angle.name) &&
      entry.Output.some(output => output.Destination.Id === hair.name)
    );
    if (!physics || !physicsSetting) throw new Error('角度Z→髪の横揺れの物理演算設定がありません');
    function oscillate(param: typeof breath, fraction: number, period: number, t: number): number {
      const midpoint = (param.min + param.max) / 2;
      const amplitude = (param.max - param.min) * fraction / 2;
      return Math.max(param.min, Math.min(param.max, midpoint + amplitude * Math.sin(2 * Math.PI * t / period)));
    }

    const textureFiles = Array.from({ length: settings.getTextureCount() }, (_, i) => settings.getTextureFileName(i));
    const images = await Promise.all(textureFiles.map(path => getTexture(base + path)));
    stage = 'WebGL';
    const textures = images.map(image => {
      const texture = gl.createTexture();
      if (!texture) throw new Error('WebGL テクスチャを作成できません');
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });

    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let i = 0; i < cubism.getDrawableCount(); i++) {
      const positions = cubism.getDrawableVertexPositions(i);
      for (let j = 0; j < positions.length; j += 2) {
        bounds.minX = Math.min(bounds.minX, positions[j]);
        bounds.maxX = Math.max(bounds.maxX, positions[j]);
        bounds.minY = Math.min(bounds.minY, positions[j + 1]);
        bounds.maxY = Math.max(bounds.maxY, positions[j + 1]);
      }
    }
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    function resize(): void {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      model.createRenderer(canvas.width, canvas.height);
      const renderer = model.getRenderer();
      renderer.startUp(gl);
      renderer.setIsPremultipliedAlpha(true);
      renderer.setRenderState(null, [0, 0, canvas.width, canvas.height]);
      textures.forEach((texture, i) => renderer.bindTexture(i, texture));
      renderer.loadShaders('/live2d-sdk/shaders/');
    }
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    const started = last;
    let lastMetrics = 0;
    function frame(now: number): void {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - started) / 1000;
      cubism.loadParameters();
      cubism.setParameterValueByIndex(breath.index, oscillate(breath, 1, 3.2, t));
      cubism.setParameterValueByIndex(angle.index, oscillate(angle, 1, 3, t));
      cubism.setParameterValueByIndex(body.index, oscillate(body, 1, 4, t));
      const mouthLevel = getRealtimeMouthLevel(dt);
      cubism.setParameterValueByIndex(mouth.index,
        mouth.min + (mouth.max - mouth.min) * mouthLevel);
      blink?.updateParameters(cubism, dt);
      physics?.evaluate(cubism, dt);
      if (now - lastMetrics > 100) {
        metrics.textContent = targets.map(param =>
          `${param.name}: ${cubism.getParameterValueByIndex(param.index).toFixed(2)}  [${param.min}, ${param.max}]`
        ).join('\n') + `\nremote audio RMS: ${getRealtimeOutputRms().toFixed(3)}`;
        lastMetrics = now;
      }
      cubism.update();

      const screenAspect = canvas.width / canvas.height;
      const fit = Math.min(1.8 / height, 1.8 * screenAspect / width);
      const matrix = new CubismMatrix44();
      matrix.setMatrix(new Float32Array([
        fit / screenAspect, 0, 0, 0,
        0, fit, 0, 0,
        0, 0, 1, 0,
        -centerX * fit / screenAspect, -centerY * fit, 0, 1,
      ]));
      const renderer = model.getRenderer();
      renderer.setMvpMatrix(matrix);
      renderer.setRenderState(null, [0, 0, canvas.width, canvas.height]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      renderer.drawModel('/live2d-sdk/shaders/');
      requestAnimationFrame(frame);
    }
    status.textContent = '';
    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    status.textContent = `読み込みエラー (${stage}): ${error instanceof Error ? error.message : String(error)}`;
  }
}
