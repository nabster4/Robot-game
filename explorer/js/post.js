'use strict';
// Compact HDR post-processing: scene → half-float target → multi-level bloom → ACES tonemap,
// vignette, damage chromatic aberration, film grain. Written as a classic script so the game
// runs straight from file:// without ES-module loading.

class PostFX {
  constructor(renderer) {
    this.r = renderer;
    const isGL2 = renderer.capabilities.isWebGL2;
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtScene = new THREE.WebGLRenderTarget(4, 4, Object.assign({ samples: isGL2 ? 4 : 0 }, opts));
    this.levels = [];
    for (let i = 0; i < 4; i++) {
      this.levels.push({ a: new THREE.WebGLRenderTarget(4, 4, opts), b: new THREE.WebGLRenderTarget(4, 4, opts), w: 4, h: 4 });
    }
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, threshold: { value: 0.85 } },
      vertexShader: vert,
      fragmentShader: `uniform sampler2D tex; uniform float threshold; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tex, vUv).rgb; float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.6, l), 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: vert,
      fragmentShader: `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
        void main(){
          vec3 s = texture2D(tex, vUv).rgb * 0.2270270270;
          s += texture2D(tex, vUv + dir * 1.3846153846).rgb * 0.3162162162;
          s += texture2D(tex, vUv - dir * 1.3846153846).rgb * 0.3162162162;
          s += texture2D(tex, vUv + dir * 3.2307692308).rgb * 0.0702702703;
          s += texture2D(tex, vUv - dir * 3.2307692308).rgb * 0.0702702703;
          gl_FragColor = vec4(s, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
        strength: { value: 0.9 }, exposure: { value: 1.0 }, vignette: { value: 0.45 }, damage: { value: 0 }, time: { value: 0 },
        tint: { value: new THREE.Color(0, 0, 0) }, tintAmt: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: `uniform sampler2D tScene, tB0, tB1, tB2, tB3; uniform float strength, exposure, vignette, damage, time, tintAmt; uniform vec3 tint; varying vec2 vUv;
        vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
        void main(){
          vec2 uv = vUv; vec2 off = (uv - 0.5) * (0.004 + damage * 0.012);
          vec3 col = vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b);
          vec3 bloom = texture2D(tB0, uv).rgb * 1.0 + texture2D(tB1, uv).rgb * 0.9 + texture2D(tB2, uv).rgb * 0.8 + texture2D(tB3, uv).rgb * 0.7;
          col += bloom * strength;
          col = mix(col, col + tint, tintAmt);
          col = aces(col * exposure);
          float d = length(uv - 0.5);
          float v = smoothstep(0.9, 0.3, d);
          col *= mix(1.0 - vignette, 1.0, v);
          col = mix(col, vec3(0.75, 0.04, 0.08), damage * (1.0 - v) * 0.8);
          col = pow(col, vec3(1.0 / 2.2));
          float n = fract(sin(dot(uv * (time + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
          col += (n - 0.5) * 0.025;
          gl_FragColor = vec4(col, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
  }

  setSize(w, h, dpr) {
    const W = Math.max(4, Math.floor(w * dpr)), H = Math.max(4, Math.floor(h * dpr));
    this.rtScene.setSize(W, H);
    this.levels.forEach((L, i) => {
      L.w = Math.max(2, W >> (i + 1)); L.h = Math.max(2, H >> (i + 1));
      L.a.setSize(L.w, L.h); L.b.setSize(L.w, L.h);
    });
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.quadScene, this.quadCam);
  }

  render(scene, camera, time) {
    const r = this.r;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);

    this.brightMat.uniforms.tex.value = this.rtScene.texture;
    this.pass(this.brightMat, this.levels[0].b);
    let input = this.levels[0].b.texture;
    for (let i = 0; i < this.levels.length; i++) {
      const L = this.levels[i];
      if (i > 0) { this.blurMat.uniforms.tex.value = input; this.blurMat.uniforms.dir.value.set(1 / L.w, 0); this.pass(this.blurMat, L.b); }
      else { this.blurMat.uniforms.tex.value = input; this.blurMat.uniforms.dir.value.set(1 / L.w, 0); this.pass(this.blurMat, L.a); this.blurMat.uniforms.tex.value = L.a.texture; this.blurMat.uniforms.dir.value.set(0, 1 / L.h); this.pass(this.blurMat, L.b); input = L.b.texture; continue; }
      this.blurMat.uniforms.tex.value = L.b.texture; this.blurMat.uniforms.dir.value.set(0, 1 / L.h); this.pass(this.blurMat, L.a);
      input = L.a.texture;
    }
    const u = this.compMat.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tB0.value = this.levels[0].b.texture;
    u.tB1.value = this.levels[1].a.texture;
    u.tB2.value = this.levels[2].a.texture;
    u.tB3.value = this.levels[3].a.texture;
    u.time.value = time % 100;
    this.pass(this.compMat, null);
  }
}
