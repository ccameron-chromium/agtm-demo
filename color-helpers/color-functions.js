const kColorFunctionGLSL = `
const int kPrimariesSRGB = 1;
const int kPrimariesRec2020 = 9;
const int kPrimariesP3 = 12;
const int kPrimariesXYZD50 = 1000;

const int kTransferRec709 = 1;
const int kTransferG22 = 4;
const int kTransferG28 = 6;
const int kTransferSRGB = 13;
const int kTransferRec2020_10bit = 14;
const int kTransferRec2020_12bit = 15;
const int kTransferPQ = 16;
const int kTransferHLG = 18;

mat3 primariesToXYZD50(int primaries) {
  if (primaries == kPrimariesSRGB) {
    return mat3(0.43606567, 0.2224884,  0.01391602,
                0.38514709, 0.71687317, 0.09707642,
                0.14306641, 0.06060791, 0.71409607);
  }
  if (primaries == kPrimariesRec2020) {
    return mat3(0.673459,  0.279033,   -0.00193139,
                0.165661,  0.675338,    0.0299794,
                0.1251,    0.0456288,   0.797162);
  }
  if (primaries == kPrimariesP3) {
    return mat3(0.515102,  0.241182,  -0.00104941,
                0.291965,  0.692236,   0.0418818,
                0.157153,  0.0665819,  0.784378);
  }
  if (primaries == kPrimariesXYZD50) {
    return mat3(1.0, 0.0, 0.0,
                0.0, 1.0, 0.0,
                0.0, 0.0, 1.0);
  }
  return mat3(1.0);
}
mat3 primariesFromXYZD50(int primaries) {
  if (primaries == kPrimariesSRGB) {
    return mat3( 3.13411215, -0.97878729,  0.07198304,
                -1.61739246,  1.91627959, -0.22898585,
                -0.4906334,   0.03345471,  1.40538513);
  }
  if (primaries == kPrimariesRec2020) {
    return mat3( 1.6472752,  -0.68261762,  0.02966273,
                -0.39360248,  1.64761778, -0.06291669,
                -0.23598029,  0.01281627,  1.25339643);
  }
  if (primaries == kPrimariesP3) {
    return mat3( 2.40404516, -0.84222838,  0.04818706,
                -0.98989869,  1.79885051, -0.09737385,
                -0.39763172,  0.01604817,  1.27350664);
  }
  if (primaries == kPrimariesXYZD50) {
    return mat3(1.0, 0.0, 0.0,
                0.0, 1.0, 0.0,
                0.0, 0.0, 1.0);
  }
  return mat3(1.0);
}
vec3 primariesConvert(vec3 rgb, int src, int dst) {
  if (src == dst) {
    return rgb;
  }
  return primariesFromXYZD50(dst) * primariesToXYZD50(src) * rgb;
}


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
