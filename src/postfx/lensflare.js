export const LensflareShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.35 },
    uThreshold: { value: 0.9 },
    uGhostSpacing: { value: 0.22 },
    uGhostAttenuation: { value: 50 },
    uGhostTint: { value: [1, 1, 1] },
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
    uniform float uStrength;
    uniform float uThreshold;
    uniform float uGhostSpacing;
    uniform float uGhostAttenuation;
    uniform vec3 uGhostTint;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength < 0.001) {
        gl_FragColor = base;
        return;
      }

      vec2 flipped = 1.0 - vUv;
      vec2 delta = (vUv - 0.5) * uGhostSpacing;
      vec3 ghosts = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        vec2 sampleUv = fract(flipped + delta * float(i));
        float dist = distance(sampleUv, vec2(0.5));
        float atten = pow(max(1.0 - dist, 0.0), uGhostAttenuation * 0.08);
        vec3 sampleColor = max(texture2D(tDiffuse, sampleUv).rgb - vec3(uThreshold), 0.0);
        ghosts += sampleColor * uGhostTint * atten;
      }

      gl_FragColor = vec4(base.rgb + ghosts * uStrength * 0.3, base.a);
    }
  `,
};
