////////////////////////////////////////////////////////////////////////
// Public interface

export const binaryToSyntax = function(binary) {
    let syntax = {};
    parseApplicationInfo(new ReadBitStream(binary), syntax);
    return syntax;
}

export const syntaxToBinary = function(syntax) {
    let stream = new WriteBitStream();
    writeApplicationInfo(stream, syntax);
    return stream.output();
}

export const syntaxToColorVolumeTransform = function(syntax) {
  return semanticsColorVolumeTransform(syntax);
}

export const binaryToColorVolumeTransform = function(syntax) {
  return semanticsColorVolumeTransform(syntax);
}

////////////////////////////////////////////////////////////////////////
// Helper classes for reading/writing bitstreams (Gemini generated)

let uint16_to_float = function(v, clamp_min, clamp_max, offset, scale) {
  if (v < clamp_min) v = clamp_min;
  if (v > clamp_max) v = clamp_max;
  return (v - offset) / scale;
}

// Class to read a Uint8Array, bit-by-bit.
class ReadBitStream {
    constructor(uint8Array) {
        this.bytes = uint8Array;
        this.byteIndex = 0;
        this.bitIndex = 0; // 0..7, MSB first
    }
    read(bits) {
        let value = 0;
        for (let i = 0; i < bits; i++) {
            if (this.byteIndex >= this.bytes.length) {
                throw new Error("End of stream reached");
            }
            const byte = this.bytes[this.byteIndex];
            const bit = (byte >> (7 - this.bitIndex)) & 1;
            value = (value << 1) | bit;

            this.bitIndex++;
            if (this.bitIndex === 8) {
                this.bitIndex = 0;
                this.byteIndex++;
            }
        }
        return value;
    }
};

// Class to write a Uint8Array, bit-by-bit
class WriteBitStream {
  constructor() {
    this.buffer = [];        // Dynamic storage for completed bytes
    this.currentByte = 0;    // The byte currently being built
    this.bitsFilled = 0;     // How many bits of currentByte are used
  }

  write(x, bits) {
    if (bits >= 8 && this.bitsFilled !== 0) {
      throw("Stream not bit aligned");
    }

    x &= (1 << bits) - 1; 
    while (bits > 0) {
      const spaceLeft = 8 - this.bitsFilled;
      if (bits <= spaceLeft) {
        this.currentByte |= (x << (spaceLeft - bits));
        this.bitsFilled += bits;
        bits = 0; // We are done
      } else {
        const bitsToWrite = spaceLeft;
        const shiftAmount = bits - bitsToWrite;
        const chunk = (x >>> shiftAmount); 
        this.currentByte |= chunk;
        this.buffer.push(this.currentByte);
        this.currentByte = 0;
        this.bitsFilled = 0;
        bits -= bitsToWrite;
        x &= (1 << bits) - 1; 
      }
      if (this.bitsFilled === 8) {
        this.buffer.push(this.currentByte);
        this.currentByte = 0;
        this.bitsFilled = 0;
      }
    }
  }
  output() {
    if (this.bitsFilled !== 0) {
      throw("Output not bit aligned");
    }
    if (this.bitsFilled === 0) {
      return new Uint8Array(this.buffer);
    }
  }
}

////////////////////////////////////////////////////////////////////////
// Functions to parse and write the syntax from or to a bitstream

// Table C.1 — Application #5 syntax structure
let parseApplicationInfo = function(stream, syntax) {
    syntax.application_version = stream.read(3);
    syntax.minimum_application_version = stream.read(3);
    syntax.reserved_zero_c1 = stream.read(2);
    parseColorVolumeTransform(stream, syntax);
}
let writeApplicationInfo = function(stream, syntax) {
    stream.write(syntax.application_version, 3);
    stream.write(syntax.minimum_application_version, 3);
    stream.write(0, 2);
    writeColorVolumeTransform(stream, syntax);
}

// Table C.2 — Color volume transform syntax structure
let parseColorVolumeTransform = function(stream, syntax) {
    syntax.has_custom_hdr_reference_white_flag = stream.read(1);
    syntax.has_adaptive_tone_map_flag = stream.read(1);
    syntax.reserved_zero_c2 = stream.read(6);

    if (syntax.has_custom_hdr_reference_white_flag === 1) {
        syntax.hdr_reference_white = stream.read(16);
    }
    if (syntax.has_adaptive_tone_map_flag === 1) {
        parseAdaptiveToneMap(stream, syntax);
    }
}
let writeColorVolumeTransform = function(stream, syntax) {
    stream.write(syntax.has_custom_hdr_reference_white_flag, 1);
    stream.write(syntax.has_adaptive_tone_map_flag, 1);
    stream.write(0, 6);
    if (syntax.has_custom_hdr_reference_white_flag === 1) {
        stream.write(syntax.hdr_reference_white, 16);
    }
    if (syntax.has_adaptive_tone_map_flag === 1) {
        writeAdaptiveToneMap(stream, syntax);
    }
}

// Table C.3 — Headroom-adaptive tone map structure syntax
let parseAdaptiveToneMap = function(stream, syntax) {
    syntax.baseline_hdr_headroom = stream.read(16);
    syntax.use_reference_white_tone_mapping_flag = stream.read(1);

    if (syntax.use_reference_white_tone_mapping_flag === 0) {
        syntax.num_alternate_images = stream.read(3);
        syntax.gain_application_space_chromaticities_mode = stream.read(2);
        syntax.has_common_component_mix_params_flag = stream.read(1);
        syntax.has_common_curve_params_flag = stream.read(1);
        
        if (syntax.gain_application_space_chromaticities_mode === 3) {
            syntax.gain_application_space_chromaticities = [];
            for (let r = 0; r < 8; r++) {
                syntax.gain_application_space_chromaticities[r] = stream.read(16);
            }
        }

        if (syntax.num_alternate_images > 0) {
            syntax.alternate_hdr_headrooms = [];
            syntax.component_mixing_type = [];
            syntax.has_component_mixing_coefficient_flag = [];
            syntax.component_mixing_coefficients = [];
            syntax.gain_curve_num_control_points_minus_1 = [];
            syntax.gain_curve_use_pchip_slope_flag = [];
            syntax.gain_curve_control_points_x = [];
            syntax.gain_curve_control_points_y = [];
            syntax.gain_curve_control_points_theta = [];
            syntax.reserved_zero_c4 = []
            syntax.reserved_zero_c5 = []

            const num_alternate_images_loop_limit = Math.min(syntax.num_alternate_images, 4);
            for (let a = 0; a < num_alternate_images_loop_limit; a++) {
                syntax.alternate_hdr_headrooms[a] = stream.read(16);
                parseComponentMixing(stream, syntax, a);
                parseGainCurve(stream, syntax, a);
            }
        }
    } else {
        syntax.reserved_zero_c3 = stream.read(7);
    }
}
let writeAdaptiveToneMap = function(stream, syntax) {
    stream.write(syntax.baseline_hdr_headroom, 16);
    stream.write(syntax.use_reference_white_tone_mapping_flag, 1);

    if (syntax.use_reference_white_tone_mapping_flag === 0) {
        stream.write(syntax.num_alternate_images, 3);
        stream.write(syntax.gain_application_space_chromaticities_mode, 2);
        stream.write(syntax.has_common_component_mix_params_flag, 1);
        stream.write(syntax.has_common_curve_params_flag, 1);
        
        if (syntax.gain_application_space_chromaticities_mode === 3) {
            for (let r = 0; r < 8; r++) {
                stream.write(syntax.gain_application_space_chromaticities[r], 16);
            }
        }

        if (syntax.num_alternate_images > 0) {
            const num_alternate_images_loop_limit = Math.min(syntax.num_alternate_images, 4);
            for (let a = 0; a < num_alternate_images_loop_limit; a++) {
                stream.write(syntax.alternate_hdr_headrooms[a], 16);
                writeComponentMixing(stream, syntax, a);
                writeGainCurve(stream, syntax, a);
            }
        }
    } else {
        stream.write(0, 7);
    }
}

// Table C.4 — Component mixing function structure syntax
let parseComponentMixing = function(stream, syntax, a) {
  if (a === 0 || syntax.has_common_component_mix_params_flag === 0) {
    syntax.component_mixing_type[a] = stream.read(2);

    if (syntax.component_mixing_type[a] !== 3) {
      syntax.has_component_mixing_coefficient_flag[a] = null;
      syntax.component_mixing_coefficients[a] = null;
      syntax.reserved_zero_c4[a] = stream.read(6);
    } else {
      syntax.has_component_mixing_coefficient_flag[a] = [];
      syntax.component_mixing_coefficients[a] = [];
      syntax.reserved_zero_c4[a] = null;
      for (let k = 0; k < 6; k++) {
        syntax.has_component_mixing_coefficient_flag[a][k] = stream.read(1);
      }
      for (let k = 0; k < 6; k++) {
        if (syntax.has_component_mixing_coefficient_flag[a][k] === 1) {
          syntax.component_mixing_coefficients[a][k] = stream.read(16); 
        } else {
          syntax.component_mixing_coefficients[a][k] = 0;
        }
      }
    }
  } else {
    syntax.component_mixing_coefficients[a] = [];
    for (let k = 0; k < 6; k++) {
      syntax.component_mixing_coefficients[a][k] = syntax.component_mixing_coefficients[0][k];
    }
  }
}
let writeComponentMixing = function(stream, syntax, a) {
  if (a === 0 || syntax.has_common_component_mix_params_flag === 0) {
    stream.write(syntax.component_mixing_type[a], 2);
    if (syntax.component_mixing_type[a] !== 3) {
      stream.write(syntax.reserved_zero_c4[a], 6);
    } else {
      for (let k = 0; k < 6; k++) {
        stream.write(syntax.has_component_mixing_coefficient_flag[a][k], 1);
      }
      for (let k = 0; k < 6; k++) {
        if (syntax.has_component_mixing_coefficient_flag[a][k] === 1) {
          stream.write(syntax.component_mixing_coefficients[a][k], 16); 
        }
      }
    }
  }
}

// Table C.5 — Gain curve structure syntax
let parseGainCurve = function(stream, syntax, a) {
    if (a === 0 || syntax.has_common_curve_params_flag === 0) {
        syntax.gain_curve_num_control_points_minus_1[a] = stream.read(5);
        syntax.gain_curve_use_pchip_slope_flag[a] = stream.read(1);
        syntax.reserved_zero_c5[a] = stream.read(2);

        syntax.gain_curve_control_points_x[a] = [];
        for (let c = 0; c < syntax.gain_curve_num_control_points_minus_1[a] + 1; c++) {
            syntax.gain_curve_control_points_x[a][c] = stream.read(16);
        }
    } else {
        syntax.reserved_zero_c5[a] = null;
        syntax.gain_curve_num_control_points_minus_1[a] = syntax.gain_curve_num_control_points_minus_1[0];
        syntax.gain_curve_use_pchip_slope_flag[a] = syntax.gain_curve_use_pchip_slope_flag[0];
        syntax.gain_curve_control_points_x[a] = syntax.gain_curve_control_points_x[0];
    }
    syntax.gain_curve_control_points_y[a] = [];
    for (let c = 0; c < syntax.gain_curve_num_control_points_minus_1[a] + 1; c++) {
        syntax.gain_curve_control_points_y[a][c] = stream.read(16);
    }
    if (syntax.gain_curve_use_pchip_slope_flag[a] === 0) {
        syntax.gain_curve_control_points_theta[a] = [];
        for (let c = 0; c < syntax.gain_curve_num_control_points_minus_1[a] + 1; c++) {
            syntax.gain_curve_control_points_theta[a][c] = stream.read(16);
        }
    }
}
let writeGainCurve = function(stream, syntax, a) {
    if (a === 0 || syntax.has_common_curve_params_flag === 0) {
        stream.write(syntax.gain_curve_num_control_points_minus_1[a], 5);
        stream.write(syntax.gain_curve_use_pchip_slope_flag[a], 1);
        stream.write(syntax.reserved_zero_c5[a], 2);
        for (let c = 0; c < syntax.gain_curve_num_control_points_minus_1[a] + 1; c++) {
            stream.write(syntax.gain_curve_control_points_x[a][c], 16);
        }
    }
    for (let c = 0; c < syntax.gain_curve_num_control_points_minus_1[a] + 1; c++) {
        stream.write(syntax.gain_curve_control_points_y[a][c], 16);
    }
    if (syntax.gain_curve_use_pchip_slope_flag[a] === 0) {
        for (let c = 0; c < syntax.gain_curve_num_control_points_minus_1[a] + 1; c++) {
            stream.write(syntax.gain_curve_control_points_theta[a][c], 16);
        }
    }
}

////////////////////////////////////////////////////////////////////////
// Semantics

// Clause C.3.5: Gain application color space chromaticity semantics
let semanticsGainApplicationChromaticities = function(syntax) {
  if (syntax.gain_application_space_chromaticities_mode === 0) {
    return getRec709Primaries();
  } else if (syntax.gain_application_space_chromaticities_mode === 1) {
    return getP3Primaries();
  } else if (syntax.gain_application_space_chromaticities_mode === 2) {
    return getRec2020Primaries();
  } else if (syntax.gain_application_space_chromaticities_mode === 3) {
    let gainApplicationChromaticities = [];
    for (let r = 0; r < 8; ++r) {
      gainApplicationChromaticities[r] = 
          uint16_to_float(syntax.gain_application_space_chromaticities[r], 0, 50000, 0, 50000.0);
    }
    return gainApplicationChromaticities;
  }
}

// Clause C.3.6: Component mixing semantics
let semanticsComponentMix = function(syntax, a) {
  if (syntax.component_mixing_type[a] === 0) {
    return {
      red: 0, green: 0, blue: 0, min: 0, max: 1, component: 0
    };
  } else if (syntax.component_mixing_type[a] === 1) {
    return {
      red: 0, green: 0, blue: 0, max: 0, min: 0, component: 1
    };
  } else if (syntax.component_mixing_type[a] === 2) {
    return {
      red: 1/6, green: 1/6, blue: 1/6, max: 1/2, min: 0, component: 0
    };
  } else if (syntax.component_mixing_type[a] === 3) {
    let p = syntax.component_mixing_coefficients[a].map(
        x => uint16_to_float(x, 0, 50000, 0, 50000.0));
    let p_sum = p.reduce((a,b) => a + b, 0);
    return {
      red:       p[0] / p_sum,
      green:     p[1] / p_sum,
      blue:      p[2] / p_sum,
      max:       p[3] / p_sum,
      min:       p[4] / p_sum,
      component: p[5] / p_sum,
    };
  }
}

// Clause C.3.7: Gain curve semantics
let semanticsGainCurve = function(syntax, a) {
  let gainCurve = {
    controlPoints: []
  };
  const sign = syntax.baseline_hdr_headroom < syntax.alternate_hdr_headrooms[a] ?
               1.0 : -1.0;
  for (let c = 0; c < syntax.gain_curve_num_control_points_minus_1[a] + 1; c++) {
    let cp = {
      x: uint16_to_float(syntax.gain_curve_control_points_x[a][c], 0, 64000, 0, 1000.0),
      y: sign * uint16_to_float(syntax.gain_curve_control_points_y[a][c], 0, 60000, 0, 10000.0),
    };
    if (syntax.gain_curve_use_pchip_slope_flag[a] === 0) {
      const theta = uint16_to_float(syntax.gain_curve_control_points_theta[a][c], 1, 35999, 18000, 36000.0 / Math.PI);
      cp.m = Math.tan(theta);
    }
    gainCurve.controlPoints.push(cp);
  }
  if (syntax.gain_curve_use_pchip_slope_flag[a] === 1) {
    populateWithPCHIP(gainCurve.controlPoints);
  }
  return gainCurve;
}

// Clause C.3.4: Adaptive tone mapping semantics
let semanticsHeadroomAdaptiveToneMap = function(syntax) {
  let hatm = {};
  hatm.baselineHdrHeadroom = uint16_to_float(syntax.baseline_hdr_headroom, 0, 60000, 0, 10000.0);
  if (syntax.use_reference_white_tone_mapping_flag === 0) {
    hatm.gainApplicationChromaticities = semanticsGainApplicationChromaticities(syntax);
    hatm.alternateImages = [];
    const num_alternate_images_loop_limit = Math.min(syntax.num_alternate_images, 4);
    for (let a = 0; a < num_alternate_images_loop_limit; a++) {
      hatm.alternateImages.push({
        hdrHeadroom: uint16_to_float(syntax.alternate_hdr_headrooms[a], 0, 60000, 0, 10000.0),
        colorGainFunction: {
          componentMix: semanticsComponentMix(syntax, a),
          gainCurve:    semanticsGainCurve(syntax, a)
        }
      });
    }
  } else {
    populateWithRWTMO(hatm);
  }
  return hatm;
}

// Clause C.3.3: Color volume transform semantics
let semanticsColorVolumeTransform = function(syntax) {
  let cvt = {};
  if (syntax.has_custom_hdr_reference_white_flag === 1) {
    cvt.hdrReferenceWhite = uint16_to_float(syntax.hdr_reference_white, 1, 50000, 0, 5.0);
  } else {
    cvt.hdrReferenceWhite = 203.0;
  }
  if (syntax.has_adaptive_tone_map_flag === 1) {
    cvt.headroomAdaptiveToneMap = semanticsHeadroomAdaptiveToneMap(syntax);
  }
  return cvt;
}

// Clause C.3.8: Reference white adaptive tone mapping computation
let populateWithRWTMO = function(hatm) {
  hatm.gainApplicationChromaticities = getRec2020Primaries();

  if (hatm.baselineHdrHeadroom === 0) {
    hatm.alternateImages = [];
    return;
  }

  hatm.alternateImages = [{}, {}];
  hatm.alternateImages[0].hdrHeadroom = 0;
  hatm.alternateImages[1].hdrHeadroom =
      Math.log2(8 / 3) * Math.min(hatm.baselineHdrHeadroom / Math.log2(1000 / 203), 1);

  for (let a = 0; a < 2; ++a) {
    let alt = hatm.alternateImages[a];
    let componentMix = {
      red: 0,
      green: 0,
      blue: 0,
      max: 1,
      min: 0,
      component: 0,
    };
    let gainCurve = {
      controlPoints: []
    }

    // Formula (C.2)
    const yWhite = (a === 1) ?
        1 :
        1 - 0.5 * Math.min(hatm.baselineHdrHeadroom / Math.log2(1000 / 203), 1);

    const kappa = 0.65;
    const xKnee = 1;
    const yKnee = yWhite;
    const xMax = Math.pow(2, hatm.baselineHdrHeadroom);
    const yMax = Math.pow(2, alt.hdrHeadroom);

    // Formula (C.3)
    const xMid = (1 - kappa) * xKnee + kappa * (xKnee * yMax / yKnee);
    const yMid = (1 - kappa) * yKnee + kappa * yMax;

    // Formula (C.5)
    const xA = xKnee - 2 * xMid + xMax;
    const yA = yKnee - 2 * yMid + yMax;
    const xB = 2 * (xMid - xKnee);
    const yB = 2 * (yMid - yKnee);
    const xC = xKnee;
    const yC = yKnee;

    const N = 8;
    for (let c = 0; c < N; ++c) {
      const t = c / (N - 1);

      // Formula (C.4)
      const x = xC + t * (xB + t * xA);
      const y = yC + t * (yB + t * yA);
      const m = (2 * yA * t + yB) / (2 * xA * t + xB);

      // Formula (C.6)
      gainCurve.controlPoints.push({
        x: x,
        y: Math.log2(y / x),
        m: (x * m - y) / (Math.log(2) * x * y),
      });
    }
    alt.colorGainFunction = {
      componentMix: componentMix,
      gainCurve: gainCurve
    };
  }
}

// Clause C.3.9: Piecewise cubic Hermite interpolation package slope computation
let populateWithPCHIP = function(cp) {
  const N = cp.length;

  const h = new Array(N - 1);
  const s = new Array(N - 1);
  for (let i = 0; i < N - 1; ++i) {
    h[i] = cp[i + 1].x - cp[i].x;
    s[i] = (cp[i + 1].y - cp[i].y) / h[i];
  }

  if (N >= 3) {
    // Formula (C.7) and Formula (C.8)
    cp[0].m = ((2 * h[0] + h[1]) * s[0] - h[0] * s[1]) / (h[0] + h[1]);
    cp[N - 1].m = ((2 * h[N - 2] + h[N - 3]) * s[N - 2] - h[N - 2] * s[N - 3]) / (h[N - 2] + h[N - 3]);
  } else if (N === 2) {
    cp[0].m = s[0];
    cp[N - 1].m = s[0];
  } else {
    cp[0].m = 0.0;
  }

  for (let i = 1; i <= N - 2; ++i) {
    // Formula (C.9)
    if (s[i - 1] * s[i] < 0.0) {
      cp[i].m = 0.0;
    } else {
      const num = 3 * (h[i - 1] + h[i]) * s[i - 1] * s[i];
      const den = (2 * h[i - 1] + h[i]) * s[i - 1] + (h[i - 1] + 2 * h[i]) * s[i];
      cp[i].m = (den === 0) ? 0.0 : num / den;
    }
  }
}

let getRec709Primaries = function() {
  return [0.64, 0.33, 0.3, 0.6, 0.15, 0.06, 0.3127, 0.329];
}

let getP3Primaries = function() {
  return [0.68, 0.32, 0.265, 0.69, 0.15, 0.06, 0.3127, 0.329];
}

let getRec2020Primaries = function() {
  return [0.708, 0.292, 0.170, 0.797, 0.131, 0.046, 0.3127, 0.329];
}

