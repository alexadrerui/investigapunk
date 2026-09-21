import * as THREE from "three";

// Rain-on-glass da intro: Heartfelt (BigWings) como no Threejs-Punk.
// Filetes que escorrem e abrem a névoa, gotas-lente e condensação estática.

export const RainGlassShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 1 },
    uIntensity: { value: 0.85 },
    uSpeed: { value: 4 },
    uBlurRadius: { value: 1.4 },
    uDistortion: { value: 0.28 },
    uDropSize: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uIntensity;
    uniform float uSpeed;
    uniform float uBlurRadius;
    uniform float uDistortion;
    uniform float uDropSize;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float N(float t) {
      return fract(sin(t * 12345.564) * 7658.76);
    }

    vec3 N13(float p) {
      vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
      p3 += dot(p3, p3.yzx + 19.19);
      return fract(vec3(
        (p3.x + p3.y) * p3.z,
        (p3.x + p3.z) * p3.y,
        (p3.y + p3.z) * p3.x
      ));
    }

    float Saw(float b, float t) {
      return smoothstep(0.0, b, t) * smoothstep(1.0, b, t);
    }

    vec2 dropLayer(vec2 uv, float t) {
      vec2 UV = uv;
      uv.y += t * 0.75;
      vec2 a = vec2(6.0, 1.0);
      vec2 grid = a * 2.0;
      vec2 id = floor(uv * grid);
      uv.y += N(id.x);
      id = floor(uv * grid);
      vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
      vec2 st = fract(uv * grid) - vec2(0.5, 0.0);
      float x = n.x - 0.5;
      float y = UV.y * 20.0;
      float wiggle = sin(y + sin(y));
      x += wiggle * (0.5 - abs(x)) * (n.z - 0.5);
      x *= 0.7;
      float ti = fract(t + n.z);
      y = (Saw(0.85, ti) - 0.5) * 0.9 + 0.5;
      vec2 p = vec2(x, y);
      float d = length((st - p) * a.yx);
      float mainDrop = smoothstep(0.4 * uDropSize, 0.0, d);
      float r = sqrt(smoothstep(1.0, y, st.y));
      float cd = abs(st.x - x);
      float trail = smoothstep(0.23 * r, 0.15 * r * r, cd);
      float trailFront = smoothstep(-0.02, 0.02, st.y - y);
      trail *= trailFront * r * r;
      y = UV.y;
      y = fract(y * 10.0) + (st.y - 0.5);
      float dd = length(st - vec2(x, y));
      float droplets = smoothstep(0.3 * uDropSize, 0.0, dd);
      float m = mainDrop + droplets * r * trailFront;
      return vec2(m, trail);
    }

    float staticDrops(vec2 uv, float t) {
      uv *= 40.0;
      vec2 id = floor(uv);
      uv = fract(uv) - 0.5;
      vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
      vec2 p = (n.xy - 0.5) * 0.7;
      float d = length(uv - p);
      float fade = Saw(0.025, fract(t + n.z));
      return smoothstep(0.3, 0.0, d) * fract(n.z * 10.0) * fade;
    }

    vec2 rainMask(vec2 uv, float t, float l0, float l1, float l2) {
      float s = staticDrops(uv, t) * l0;
      vec2 m1 = dropLayer(uv, t) * l1;
      vec2 m2 = dropLayer(uv * 1.85, t) * l2;
      float c = smoothstep(0.3, 1.0, s + m1.x + m2.x);
      return vec2(c, max(m1.y * l0, m2.y * l1));
    }

    vec3 sampleBlur(vec2 uv, float radius) {
      vec2 texel = radius / max(uResolution, vec2(1.0));
      vec3 acc = vec3(0.0);
      float wsum = 0.0;
      for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
          float d2 = float(i * i + j * j);
          float w = exp(-d2 * 0.28);
          acc += texture2D(tDiffuse, uv + vec2(float(i), float(j)) * texel).rgb * w;
          wsum += w;
        }
      }
      return acc / max(wsum, 0.0001);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uAmount < 0.001) {
        gl_FragColor = base;
        return;
      }

      vec2 n = vec2(
        (vUv.x - 0.5) * uResolution.x / max(uResolution.y, 1.0),
        vUv.y - 0.5
      );
      float t = uTime * 0.2 * uSpeed;
      float rainAmount = uIntensity;
      float l0 = smoothstep(-0.5, 1.0, rainAmount) * 2.0;
      float l1 = smoothstep(0.25, 0.75, rainAmount);
      float l2 = smoothstep(0.0, 0.5, rainAmount);
      vec2 d = rainMask(n, t, l0, l1, l2);
      vec2 e = vec2(0.001, 0.0);
      float cx = rainMask(n + e, t, l0, l1, l2).x;
      float cy = rainMask(n + e.yx, t, l0, l1, l2).x;
      vec2 g = vec2(cx - d.x, cy - d.x) * 3.5;
      vec2 refractUv = vUv + g * uDistortion * uDropSize * (1.0 + d.x * 0.5);

      float maxBlur = mix(3.0, 6.0, rainAmount) * (uBlurRadius / 3.5);
      float minBlur = 2.0 * (uBlurRadius / 3.5);
      float focus = mix(maxBlur - d.y * 4.0, minBlur, smoothstep(0.1, 0.2, d.x));
      focus = max(focus, 0.6);

      vec3 sharp = texture2D(tDiffuse, refractUv).rgb;
      vec3 fog = sampleBlur(refractUv, focus);
      float fogAmt = mix(1.0, 0.2, clamp(d.y * 1.4, 0.0, 1.0));
      fogAmt = mix(fogAmt, 0.15, smoothstep(0.1, 0.35, d.x));
      vec3 y = mix(sharp, fog, clamp(fogAmt, 0.0, 1.0));

      y.r += g.x * d.x * 0.1 * uDistortion * uDropSize;
      y.g += g.y * d.x * 0.1 * uDistortion * uDropSize;
      y *= mix(vec3(1.0), vec3(1.0 + d.x * 0.2), d.x);
      y += vec3(pow(max(d.y, 0.0), 2.0) * 0.25) * (1.0 - d.x);
      y *= mix(vec3(1.0), vec3(0.85, 0.92, 1.12), 0.45);
      vec2 fromCenter = vUv - 0.5;
      y *= 1.0 - dot(fromCenter, fromCenter) * 0.75;
      vec3 wet = sampleBlur(vUv, maxBlur);
      y = mix(wet, y, d.x * 0.85);
      y *= 0.85;

      gl_FragColor = vec4(mix(base.rgb, y, uAmount), 1.0);
    }
  `,
};
