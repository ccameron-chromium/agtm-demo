const kAgtmToneMapperGLSL = `
  uniform sampler2D curve_i;
  uniform sampler2D curve_j;
  uniform float curve_size;
  uniform sampler2D lut3d_i;
  uniform sampler2D lut3d_j;
  uniform float lut3d_size_i;
  uniform float lut3d_size_j;
  uniform float weight_i;
  uniform float weight_j;
  uniform vec3 mix_rgb_i;
  uniform vec3 mix_rgb_j;
  uniform vec3 mix_Mmc_i;
  uniform vec3 mix_Mmc_j;
  uniform float baseline_max_component;
  uniform highp int gain_application_space_primaries;

  // Component mixing function.
  vec3 EvaluateChannelMix(vec3 rgb, bool j) {
    vec3 mix_rgb = j ? mix_rgb_j : mix_rgb_i;
    vec3 mix_Mmc = j ? mix_Mmc_j : mix_Mmc_i;
    return mix_Mmc[2] * rgb + 
           vec3(mix_rgb[0] * rgb[0] +
                mix_rgb[1] * rgb[1] +
                mix_rgb[2] * rgb[2] +
                mix_Mmc[0] * max(max(rgb[0], rgb[1]), rgb[2]) +
                mix_Mmc[1] * min(min(rgb[0], rgb[1]), rgb[2]));
  }

  // Piecewise cubic evaluation (via a texture).
  float SampleGainCurveTexture(vec2 tc, bool j) {
    return j ? texture(curve_j, tc).r :
               texture(curve_i, tc).r;
  }
  float EvaluateGainCurve(float x, bool j) {
    x = clamp(x, 0.0, 1.0);
    x = (x * (curve_size - 1.0) + 0.5) / curve_size;
    return SampleGainCurveTexture(vec2(x, 0.5), j);
  }

  // Tetrahedral sampling of 3D LUT.
  vec3 SampleTexture3dNearest(vec3 q, bool j) {
    // The coordinate q is an integer in the domain [0, N-1]^3.
    float N = j ? lut3d_size_j :
                  lut3d_size_i;
    vec2 tc = vec2((q.b + N*q.g + 0.5) / (N*N),
                   (q.r + 0.5) / N);
    return j ? texture(lut3d_j, tc).rgb :
               texture(lut3d_i, tc).rgb;
  }
  vec3 Sample3dTex3dTetrahedral(vec3 C_unit, bool j) {
    float N = j ? lut3d_size_j :
                  lut3d_size_i;
    if (N <= 1.0) {
      return vec3(0.0, 0.0, 0.0);
    }
    vec3 C = clamp(C_unit, 0.0, 1.0) * (N - 1.0);
    vec3 K = floor(C);
    vec3 X = C - K;
    vec3 L = vec3(1.0);
    vec3 A;
    vec3 B;
    if (X[0] >= X[1] && X[1] >= X[2]) { A = vec3(1.0, 0.0, 0.0); B = vec3(1.0, 1.0, 0.0); }
    if (X[1] >= X[0] && X[0] >= X[2]) { A = vec3(1.0, 1.0, 0.0); B = vec3(0.0, 1.0, 0.0); }
    if (X[1] >= X[2] && X[2] >= X[0]) { A = vec3(0.0, 1.0, 0.0); B = vec3(0.0, 1.0, 1.0); }
    if (X[2] >= X[1] && X[1] >= X[0]) { A = vec3(0.0, 1.0, 1.0); B = vec3(0.0, 0.0, 1.0); }
    if (X[2] >= X[0] && X[0] >= X[1]) { A = vec3(0.0, 0.0, 1.0); B = vec3(1.0, 0.0, 1.0); }
    if (X[0] >= X[2] && X[2] >= X[1]) { A = vec3(1.0, 0.0, 1.0); B = vec3(1.0, 0.0, 0.0); }

    // The matrix being inverted is a constant, but I am also lazy.
    mat3 M = mat3(L, A, B);
    vec3 w = inverse(M) * X;
    float w_k = 1.0 - w[0] - w[1] - w[2];

    // Errors in barycentric coordinates are magenta.
    if (w[0] < 0.0 || w[0] > 1.0 ||
        w[1] < 0.0 || w[1] > 1.0 ||
        w[2] < 0.0 || w[2] > 1.0 ||
        w_k  < 0.0 || w_k  > 1.0) {
      return vec3(1.0, 0.0, 1.0);
    }

    // Reconstruction errors are in cyan.
    vec3 Cr = w_k  * ( K ) +
              w[0] * (K+L) +
              w[1] * (K+A) +
              w[2] * (K+B);
    if (length(C - Cr) > 0.1) {
      return vec3(0.0, 0.0, 1.0);
    }

    vec3 x = w_k  * SampleTexture3dNearest(K,     j) +
             w[0] * SampleTexture3dNearest(K + L, j) +
             w[1] * SampleTexture3dNearest(K + A, j) +
             w[2] * SampleTexture3dNearest(K + B, j);
    return x;
  }

  vec3 AgtmLogGain(vec3 rgb, bool j) {
    vec3 mix = EvaluateChannelMix(rgb, j);
    vec3 curve = vec3(EvaluateGainCurve(mix[0], j),
                      EvaluateGainCurve(mix[1], j),
                      EvaluateGainCurve(mix[2], j));
    vec3 lut = Sample3dTex3dTetrahedral(rgb, j);
    return curve + lut;
  }

  vec3 AgtmToneMap(vec3 rgb, int input_color_primaries) {
    rgb = primariesConvert(rgb, input_color_primaries, gain_application_space_primaries);

    vec3 U = clamp(rgb / baseline_max_component, vec3(0.0), vec3(1.0));
    vec3 G = weight_i * AgtmLogGain(U, false) +
             weight_j * AgtmLogGain(U, true);
    rgb *= exp2(G);

    rgb = primariesConvert(rgb, gain_application_space_primaries, input_color_primaries);
    return rgb;
  }
  `

class AgtmToneMapper {
  constructor(gl, metadata) {
    this.gl = gl;
    this.metadata = metadata;

    if (!this.metadata) {
      return;
    }

    this.curve_size = 4096;
    this.curve_textures = [];
    for (let i = 0; i < this.metadata.altr.length; ++i) {
      let curve_pixels = new Float32Array(this.curve_size);
      let f = new PiecewiseCubic(metadata.altr[i].curve);
      for (let j = 0; j < this.curve_size; ++j) {
        let x = this.metadata.baseline_max_component * (j / (this.curve_size - 1));
        let y = f.evaluate(x).y;
        curve_pixels[j] = y;
      }

      let tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, this.curve_size, 1, 0, gl.RED, gl.FLOAT, curve_pixels);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.curve_textures = this.curve_textures.concat(tex);
    }

    this.lut3d_sizes = [];
    this.lut3d_textures = [];
    for (let i = 0; i < this.metadata.altr.length; ++i) {
      let samples = metadata.altr[i].lut3d;
      if (!samples) {
        this.lut3d_sizes = this.lut3d_sizes.concat(0);
        this.lut3d_textures = this.lut3d_textures.concat(null);
        continue;
      }
      console.log('has lut3d!');
      let N = Math.cbrt(samples.length);
      let lut3d_pixels = new Float32Array(4*N*N*N);
      let j = 0;
      let k = 0;
      for (let r = 0; r < N; ++r) {
        for (let g = 0; g < N; ++g) {
          for (let b = 0; b < N; ++b) {
            lut3d_pixels[j++] = samples[k][0];
            lut3d_pixels[j++] = samples[k][1];
            lut3d_pixels[j++] = samples[k][2];
            lut3d_pixels[j++] = 1.0
            k++;
          }
        }
      }

      let tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N*N, N, 0, gl.RGBA, gl.FLOAT, lut3d_pixels);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, null);

      this.lut3d_sizes = this.lut3d_sizes.concat(N);
      this.lut3d_textures = this.lut3d_textures.concat(tex);
    }
  }

  // Set the uniforms. This will use the 4 textures starting at tex0.
  setUniforms(targeted_hdr_headroom, program, tex0) {
    let p = program;
    let m = this.metadata;
    let gl = this.gl;
    let a = AgtmAdapt(m, targeted_hdr_headroom);

    gl.activeTexture(gl.TEXTURE0 + tex0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, this.curve_textures[a.i]);
    gl.activeTexture(gl.TEXTURE0 + tex0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.curve_textures[a.j]);
    gl.activeTexture(gl.TEXTURE0 + tex0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, this.lut3d_textures[a.i]);
    gl.activeTexture(gl.TEXTURE0 + tex0 + 3);
    gl.bindTexture(gl.TEXTURE_2D, this.lut3d_textures[a.j]);

    gl.uniform1i(gl.getUniformLocation(p, 'curve_i'), tex0 + 0);
    gl.uniform1i(gl.getUniformLocation(p, 'curve_j'), tex0 + 1);
    gl.uniform1i(gl.getUniformLocation(p, 'lut3d_i'), tex0 + 2);
    gl.uniform1i(gl.getUniformLocation(p, 'lut3d_j'), tex0 + 3);

    gl.uniform1f(gl.getUniformLocation(p, 'curve_size'), this.curve_size);
    gl.uniform1f(gl.getUniformLocation(p, 'lut3d_size_i'), this.lut3d_sizes[a.i]);
    gl.uniform1f(gl.getUniformLocation(p, 'lut3d_size_j'), this.lut3d_sizes[a.j]);

    gl.uniform3f(gl.getUniformLocation(p, 'mix_rgb_i'), m.altr[a.i].mix.rgb[0],
                                                        m.altr[a.i].mix.rgb[1],
                                                        m.altr[a.i].mix.rgb[2]);
    gl.uniform3f(gl.getUniformLocation(p, 'mix_rgb_j'), m.altr[a.j].mix.rgb[0],
                                                        m.altr[a.j].mix.rgb[1],
                                                        m.altr[a.j].mix.rgb[2]);
    gl.uniform3f(gl.getUniformLocation(p, 'mix_Mmc_i'), m.altr[a.i].mix.max,
                                                        m.altr[a.i].mix.min,
                                                        m.altr[a.i].mix.channel);
    gl.uniform3f(gl.getUniformLocation(p, 'mix_Mmc_j'), m.altr[a.j].mix.max,
                                                        m.altr[a.j].mix.min,
                                                        m.altr[a.j].mix.channel);

    gl.uniform1f(gl.getUniformLocation(p, 'weight_i'), a.weight_i);
    gl.uniform1f(gl.getUniformLocation(p, 'weight_j'), a.weight_j);
    gl.uniform1f(gl.getUniformLocation(p, 'baseline_max_component'), m.baseline_max_component);
    gl.uniform1i(gl.getUniformLocation(p, 'gain_application_space_primaries'),
                 m.gain_application_space_primaries);
  }
};
