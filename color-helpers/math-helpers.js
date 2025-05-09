let log = function(x) { return Math.log(x) }
let exp = function(x) { return Math.exp(x); }
let log2 = function(x) { return Math.log(x) / Math.log(2); }
let exp2 = function(x) { return Math.exp(x * Math.log(2)); }
let pow = function(x, y) { return Math.pow(x, y); }
let clamp = function(x, a, b) {
  return Math.min(Math.max(x, a), b);
}
let max = function(x, y) { return Math.max(x, y); }
let min = function(x, y) { return Math.min(x, y); }

let vec2_dist = function(a, b) {
  return (a.x - b.x)*(a.x - b.x) +
         (a.y - b.y)*(a.y - b.y);
}
let vec2_copy = function(a) {
  return {x:a.x, y:a.y};
}
let vec2_madd = function(s, a, b) {
  return {x:s*a.x + b.x, y:s*a.y + b.y};
}
let vec2_add = function(a, b) {
  return {x:a.x + b.x, y:a.y + b.y};
}
let vec2_sub = function(a, b) {
  return {x:a.x - b.x, y:a.y - b.y};
}
let mat2_mvm = function(A, p) {
  return {
    x:A.xx * p.x + A.xy * p.y,
    y:A.yx * p.x + A.yy * p.y
  }
}
let mat2_mm = function(A, B) {
  return {
    xx: A.xx * B.xx + A.xy * B.yx,
    xy: A.xx * B.xy + A.xy * B.yy,
    yx: A.yx * B.xx + A.yy * B.yx,
    yy: A.yx * B.xy + A.yy * B.yy
  }
}
let mat2_inv = function(A) {
  let det = 1 / (A.xx * A.yy - A.xy * A.yx);
  return {
    xx: A.yy * det,
    xy:-A.xy * det,
    yx:-A.yx * det,
    yy: A.xx * det
  }
}

// Solve f(x) = y. If x is an initial guess (set to y if none provided).
let newtonSolve = function(f, grad_f, y, x = null) {
  if (x == null) {
    x = y;
  }
  for (let i = 0; i < 25; ++i) {
    let f_of_x = f(x);
    let grad_f_of_x = grad_f(x);
    let grad_f_of_x_inv = mat2_inv(grad_f_of_x);

    let error = vec2_sub(y, f_of_x);
    let step = mat2_mvm(grad_f_of_x_inv, error);
    x = vec2_madd(1.0, step, x);
  }

  // Solve the slope directly.
  if (`m` in y) {
    let grad = grad_f(x);
    let grad_inv = mat2_inv(grad);

    let d_xy_view = {x:1, y:y.m};
    let d_xy_model = mat2_mvm(grad_inv, d_xy_view);
    x.m = d_xy_model.y / d_xy_model.x;
  }

  return x;
}
