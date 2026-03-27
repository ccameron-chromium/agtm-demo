const kColorFunctionGLSL = `
const int kTransferRec709 = 1;
const int kTransferG22 = 4;
const int kTransferG28 = 6;
const int kTransferSRGB = 13;
const int kTransferRec2020_10bit = 14;
const int kTransferRec2020_12bit = 15;
const int kTransferPQ = 16;
const int kTransferHLG = 18;

float transferToLinear(float x, int transfer) {
  if (transfer == kTransferRec709 ||
      transfer == kTransferRec2020_10bit ||
      transfer == kTransferRec2020_12bit) {
    transfer = kTransferSRGB;
  }
  if (transfer == kTransferG22) {
    return pow(x, 2.2);
  }
  if (transfer == kTransferG28) {
    return pow(x, 2.8);
  }
  if (transfer == kTransferSRGB) {
    if (x < 0.04045)
      return x / 12.92;
    return pow((x + 0.055)/1.055, 2.4);
  }
  if (transfer == kTransferPQ) {
    float c1 =  107.0 / 128.0;
    float c2 = 2413.0 / 128.0;
    float c3 = 2392.0 / 128.0;
    float m1 = 1305.0 / 8192.0;
    float m2 = 2523.0 / 32.0;
    float p = pow(clamp(x, 0.0, 1.0), 1.0 / m2);
    return pow(max(p - c1, 0.0) / (c2 - c3 * p), 1.0 / m1);
  }
  if (transfer == kTransferHLG) {
    const float a = 0.17883277;
    const float b = 1.0 - 4.0*a;
    const float c = 0.5 - a * log(4.0 * a);
    if (x <= 0.5) {
      return pow(x, 2.0) / 3.0;
    } else {
      return (exp((x - c) / a) + b) / 12.0;
    }
  }
  return 0.0;
}
float transferFromLinear(float x, int transfer) {
  if (transfer == kTransferRec709 ||
      transfer == kTransferRec2020_10bit ||
      transfer == kTransferRec2020_12bit) {
    // Do sRGB.
    transfer = kTransferSRGB;
  }
  if (transfer == kTransferG22) {
    return pow(x, 1.0/2.2);
  }
  if (transfer == kTransferG28) {
    return pow(x, 1.0/2.2);
  }
  if (transfer == kTransferSRGB) {
    if (x < 0.003130800090713953)
      return 12.919999999992248*x;
    return pow(1.1371188301409823*x, 0.4166666666666667) - 0.05499994754780801;

    if (x < 0.04045 / 12.92)
      return 12.92 * x;
    return 1.055 * pow(x/1.055, 1.0/2.4) - 0.055;
  }
  if (transfer == kTransferPQ) {
    float c1 =  107.0 / 128.0;
    float c2 = 2413.0 / 128.0;
    float c3 = 2392.0 / 128.0;
    float m1 = 1305.0 / 8192.0;
    float m2 = 2523.0 / 32.0;
    float v = pow(clamp(x, 0.0, 1.0), m1);
    return pow((c1 + c2 * v) / (1.0 + c3 * v), m2);
  }
  if (transfer == kTransferHLG) {
    const float a = 0.17883277;
    const float b = 1.0 - 4.0*a;
    const float c = 0.5 - a * log(4.0 * a);
    if (x < 1.0/12.0) {
      return sqrt(3.0 * x);
    }
    return a * log(12.0 * x - b) + c;
  }
  return 0.0;
}`

let kPrimariesSRGB = 1;
let kPrimariesRec2020 = 9;
let kPrimariesP3 = 12;
let kTransferRec709 = 1;
let kTransferG22 = 4;
let kTransferG28 = 6;
let kTransferSRGB = 13;
let kTransferRec2020_10bit = 14;
let kTransferRec2020_12bit = 15;
let kTransferPQ = 16;
let kTransferHLG = 18;

let transferFunctionToLinear = function(x, transfer) {
  if (transfer == 1 ||   // Rec709
      transfer == 14 ||  // Rec2020 10-bit
      transfer == 15) {  // Rec2020 12-bit
    // Do sRGB.
    transfer = kTransferSRGB;
  }
  if (transfer == kTransferG22) {   // Gamma 2.2
    return pow(x, 2.2);
  }
  if (transfer == kTransferG28) {   // Gamma 2.8
    return pow(x, 2.8);
  }
  if (transfer == kTransferSRGB) {   // sRGB
    if (x < 0.04045)
      return x / 12.92;
    return pow((x + 0.055)/1.055, 2.4);
  }
  if (transfer == kTransferPQ) {   // PQ
    const c1 =  107.0 / 128.0;
    const c2 = 2413.0 / 128.0;
    const c3 = 2392.0 / 128.0;
    const m1 = 1305.0 / 8192.0;
    const m2 = 2523.0 / 32.0;
    const p = pow(clamp(x, 0.0, 1.0), 1.0 / m2);
    return pow(max(p - c1, 0.0) / (c2 - c3 * p), 1.0 / m1);
  }
  if (transfer == kTransferHLG) {   // HLG
    const a = 0.17883277;
    const b = 1.0 - 4.0*a;
    const c = 0.5 - a * log(4.0 * a);
    if (x <= 0.5) {
      return pow(x, 2.0) / 3.0;
    } else {
      return (exp((x - c) / a) + b) / 12.0;
    }
  }
  return 0.0;
}

const chromaticityConversionMatrix = function(src_chromaticities, dst_chromaticities) {
  const mat3Invert = function(M) {
    const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
                M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
                M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    if (Math.abs(det) < 1e-12) return null; // Matrix is singular (no unique solution)
    const det_inv = 1/det;
    return [
        [ (M[1][1] * M[2][2] - M[1][2] * M[2][1]) * det_inv,
          (M[0][2] * M[2][1] - M[0][1] * M[2][2]) * det_inv,
          (M[0][1] * M[1][2] - M[0][2] * M[1][1]) * det_inv ],
        [ (M[1][2] * M[2][0] - M[1][0] * M[2][2]) * det_inv,
          (M[0][0] * M[2][2] - M[0][2] * M[2][0]) * det_inv,
          (M[0][2] * M[1][0] - M[0][0] * M[1][2]) * det_inv ],
        [ (M[1][0] * M[2][1] - M[1][1] * M[2][0]) * det_inv,
          (M[0][1] * M[2][0] - M[0][0] * M[2][1]) * det_inv,
          (M[0][0] * M[1][1] - M[0][1] * M[1][0]) * det_inv ]];
  };
  const mat3Vec3Multiply = function(A, x) {
    let b = [0,0,0];
    for (let i = 0; i < 3; ++i)
      for (let j = 0; j < 3; ++j)
        b[i] += A[i][j] * x[j];
    return b;
  }
  const mat3Multiply = function(...matrices) {
    const mat3Mat3Multiply = function(A, B) {
      let C = [[0,0,0],[0,0,0],[0,0,0]];
      for (let i = 0; i < 3; ++i) 
        for (let j = 0; j < 3; ++j)
          for (let k = 0; k < 3; ++k)
            C[i][j] += A[i][k] * B[k][j];
      return C;
    }
    return matrices.reduce(mat3Mat3Multiply);
  }
  const mat3Diag = function(v) {
    return [[v[0], 0, 0], [0, v[1], 0], [0, 0, v[2]]];
  }
  // Return the rgb to little-xyz matrix and the big-XYZ white point for the
  // specified chromaticities.
  const colorPrimariesWhiteAndMatrix = function(chromaticities) {
      [rx, ry, gx, gy, bx, by, wx, wy] = chromaticities;
      rgb_to_xyz = [[         rx,          gx,          bx],
                    [         ry,          gy,          by],
                    [1 - rx - ry, 1 - gx - gy, 1 - bx - by]];
      w_XYZ = [wx / wy, 1, (1 - wx - wy) / wy];
      return [rgb_to_xyz, w_XYZ];
  }
  // Return the chromatic adaptation matrix to convert from the big-XYZ white
  // point src_w_XYZ to dst_w_XYZ.
  const chromaticAdaptation = function(src_w_XYZ, dst_w_XYZ) {
      // This is the Bradford XYZ to LMS matrix.
      const XYZ_to_LMS = [
            [ 0.8951,  0.2664, -0.1614],
            [-0.7502,  1.7135,  0.0367],
            [ 0.0389, -0.0685,  1.0296]];
      const LMS_to_XYZ = mat3Invert(XYZ_to_LMS);
      const src_w_LMS = mat3Vec3Multiply(XYZ_to_LMS, src_w_XYZ);
      const dst_w_LMS = mat3Vec3Multiply(XYZ_to_LMS, dst_w_XYZ);
      const src_to_dst_scale_in_LMS = [
          dst_w_LMS[0] / src_w_LMS[0],
          dst_w_LMS[1] / src_w_LMS[1],
          dst_w_LMS[2] / src_w_LMS[2]];
      return mat3Multiply(
          LMS_to_XYZ,
          mat3Diag(src_to_dst_scale_in_LMS),
          XYZ_to_LMS);
  };

  // Compute the src RGB to big-XYZ matrix. The big-XYZ matrix has its columns
  // scaled such that the image of [1,1,1] is the white point.
  [src_rgb_to_xyz, src_w_XYZ] = colorPrimariesWhiteAndMatrix(src_chromaticities);
  let src_xyz_to_rgb = mat3Invert(src_rgb_to_xyz);                                      
  let src_xyz_scale = mat3Vec3Multiply(src_xyz_to_rgb, src_w_XYZ);
  let src_rgb_to_XYZ = mat3Multiply(
      src_rgb_to_xyz, mat3Diag(src_xyz_scale));

  // Compute the dst big-XYZ to RGB matrix.
  [dst_rgb_to_xyz, dst_w_XYZ] = colorPrimariesWhiteAndMatrix(dst_chromaticities);
  let dst_xyz_to_rgb = mat3Invert(dst_rgb_to_xyz);
  let dst_xyz_scale = mat3Vec3Multiply(dst_xyz_to_rgb, src_w_XYZ);
  [dst_rgb_to_xyz, dst_w_XYZ] = colorPrimariesWhiteAndMatrix(dst_chromaticities);
  let dst_xyz_scale_inv = [
      1/dst_xyz_scale[0],
      1/dst_xyz_scale[1],
      1/dst_xyz_scale[2]];
  let dst_XYZ_to_rgb = mat3Multiply(
      mat3Diag(dst_xyz_scale_inv), dst_xyz_to_rgb);

  // Chromatic adaptation is needed only if src and dst have different white
  // points.
  const needs_chromatic_adaptation = src_w_XYZ[0] != dst_w_XYZ[0] ||
                                     src_w_XYZ[1] != dst_w_XYZ[1] ||
                                     src_w_XYZ[2] != dst_w_XYZ[2];
  if (needs_chromatic_adaptation) {
    return mat3Multiply(
        dst_XYZ_to_rgb,
        chromaticAdaptation(src_w_XYZ, dst_w_XYZ),
        src_rgb_to_XYZ);
  } else {
    return mat3Multiply(dst_XYZ_to_rgb, src_rgb_to_XYZ);
  }
};
const chromaticityConversionMatrixColMajor = function(src_chromaticities, dst_chromaticities) {
  const m = chromaticityConversionMatrix(src_chromaticities, dst_chromaticities);
  return [m[0][0], m[1][0], m[2][0],
          m[0][1], m[1][1], m[2][1],
          m[0][2], m[1][2], m[2][2]];
};
const colorSpaceChromaticities = function(primaries) {
  if (primaries == kPrimariesSRGB) {
    return [0.64, 0.33, 0.3, 0.6, 0.15, 0.06, 0.3127, 0.329];
  }
  if (primaries == kPrimariesP3) {
    return [0.68, 0.32, 0.265, 0.69, 0.15, 0.06, 0.3127, 0.329];
  }
  if (primaries == kPrimariesRec2020) {
    return [0.708, 0.292, 0.17, 0.797, 0.131, 0.046, 0.3127, 0.329];
  }
  throw('bad primaries');
};

