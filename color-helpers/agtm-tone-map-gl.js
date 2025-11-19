const kAgtmToneMapperGLSL = `
  uniform sampler2D curve;
  uniform float curve_N_cp_i;
  uniform float curve_N_cp_j;
  uniform float curve_texcoord_y_i;
  uniform float curve_texcoord_y_j;
  uniform float weight_i;
  uniform float weight_j;
  uniform vec3 mix_rgb_i;
  uniform vec3 mix_rgb_j;
  uniform vec3 mix_Mmc_i;
  uniform vec3 mix_Mmc_j;
  uniform highp int gain_application_space_primaries;

  // Component mixing function.
  vec3 EvaluateChannelMix(vec3 rgb, vec3 mix_rgb, vec3 mix_Mmc) {
    return mix_Mmc[2] * rgb + 
           vec3(mix_rgb[0] * rgb[0] +
                mix_rgb[1] * rgb[1] +
                mix_rgb[2] * rgb[2] +
                mix_Mmc[0] * max(max(rgb[0], rgb[1]), rgb[2]) +
                mix_Mmc[1] * min(min(rgb[0], rgb[1]), rgb[2]));
  }

  // Piecewise cubic evaluation (via a texture).
  float EvaluateGainCurve(float x, float tcy, float N_cp) {
    // Check the first control point.
    float c_min = 0.0;
    vec4 xym_min = texture(curve, vec2((c_min + 0.5) / 32.0, tcy));
    if (x <= xym_min.x) {
      return xym_min.y;
    }

    // Check the last control point.
    float c_max = N_cp - 1.0;
    vec4 xym_max = texture(curve, vec2((c_max + 0.5) / 32.0, tcy));
    if (x >= xym_max.x) {
      return xym_max.y + log2(xym_max.x / x);
    }

    // Binary search to find the interval containing x. This will take at most
    // 5 steps (in the case of 32 control points)
    for (int step = 0; step < 5; ++step) {
      if (c_max - c_min < 1.1) {
        break;
      }
      float c_mid = ceil(0.5 * (c_min + c_max));
      vec4 xym_mid = texture(curve, vec2((c_mid + 0.5) / 32.0, tcy));
      if (x == xym_mid.x) {
        return xym_mid.y;
      } else if (x < xym_mid.x) {
        c_max = c_mid;
        xym_max = xym_mid;
      } else {
        c_min = c_mid;
        xym_min = xym_mid;
      }
    }

    // Compute the coefficients and evaluate the polynomial.
    float h = xym_max.x - xym_min.x;
    float mHat_min = xym_min.z * h;
    float mHat_max = xym_max.z * h;
    float c3 =  2.f * xym_min.y + mHat_min - 2.f * xym_max.y + mHat_max;
    float c2 = -3.f * xym_min.y + 3.f * xym_max.y - 2.f * mHat_min - mHat_max;
    float c1 = mHat_min;
    float c0 = xym_min.y;
    float t = (x - xym_min.x) / h;

    return ((c3*t + c2)*t + c1)*t + c0;
  }

  vec3 AgtmLogGain(vec3 rgb, vec3 mix_rgb, vec3 mix_Mmc, float curve_texcoord_y, float curve_N_cp) {
    vec3 M = EvaluateChannelMix(rgb, mix_rgb, mix_Mmc);
    if (mix_Mmc[2] == 0.0) {
      return vec3(EvaluateGainCurve(M.r, curve_texcoord_y, curve_N_cp));
    }
    return vec3(EvaluateGainCurve(M.r, curve_texcoord_y, curve_N_cp),
                EvaluateGainCurve(M.g, curve_texcoord_y, curve_N_cp),
                EvaluateGainCurve(M.b, curve_texcoord_y, curve_N_cp));
  }

  vec3 AgtmToneMap(vec3 rgb, int input_color_primaries) {
    rgb = primariesConvert(rgb, input_color_primaries, gain_application_space_primaries);

    vec3 G = vec3(0.0);
    if (weight_i > 0.0) {
      G += weight_i *
           AgtmLogGain(rgb, mix_rgb_i, mix_Mmc_i, curve_texcoord_y_i, curve_N_cp_i);
    }
    if (weight_j > 0.0) {
      G += weight_j *
           AgtmLogGain(rgb, mix_rgb_j, mix_Mmc_j, curve_texcoord_y_j, curve_N_cp_j);
    }
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

    let curve_pixels = new Float32Array(32 * 4 * 4);
    for (let i = 0; i < this.metadata.altr.length; ++i) {
      for (let jj = 0; jj < 32; ++jj) {
        let j = jj < metadata.altr[i].curve.length ? jj : (metadata.altr[i].curve.length - 1);
        curve_pixels[32*4*i + 4*j + 0] = metadata.altr[i].curve[j].x;
        curve_pixels[32*4*i + 4*j + 1] = metadata.altr[i].curve[j].y;
        curve_pixels[32*4*i + 4*j + 2] = metadata.altr[i].curve[j].m;
        curve_pixels[32*4*i + 4*j + 3] = 0;
      }
    }
    let tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 32, 4, 0, gl.RGBA, gl.FLOAT, curve_pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.curve_texture = tex;
  }

  // Set the uniforms. This will use the 4 textures starting at tex0.
  setUniforms(targeted_hdr_headroom, program, tex0) {
    let p = program;
    let m = this.metadata;
    let gl = this.gl;
    let a = AgtmAdapt(m, targeted_hdr_headroom);

    gl.activeTexture(gl.TEXTURE0 + tex0);
    gl.bindTexture(gl.TEXTURE_2D, this.curve_texture);
    gl.uniform1i(gl.getUniformLocation(p, 'curve'),   tex0);

    gl.uniform1f(gl.getUniformLocation(p, 'curve_texcoord_y_i'), (a.i + 0.5) / 4.0);
    gl.uniform1f(gl.getUniformLocation(p, 'curve_texcoord_y_j'), (a.j + 0.5) / 4.0);
    gl.uniform1f(gl.getUniformLocation(p, 'curve_N_cp_i'), m.altr[a.i].curve.length);
    gl.uniform1f(gl.getUniformLocation(p, 'curve_N_cp_j'), m.altr[a.j].curve.length);

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
    gl.uniform1i(gl.getUniformLocation(p, 'gain_application_space_primaries'),
                 m.gain_application_space_primaries);
  }
};
