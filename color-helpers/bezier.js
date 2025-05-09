class Bezier {
  constructor(wst) {
    this.wst = structuredClone(wst);
  }

  evaluate(x) {
    if (!this.wst) return x;
    return this.evalBezier(x, [0, this.wst.x1, this.wst.x2], [0, this.wst.y1, this.wst.x2]);
  }
  evaluateInverse(y) {
    if (!this.wst) return y;
    return this.evalBezier(y, [0, this.wst.y1, this.wst.x2], [0, this.wst.x1, this.wst.x2]);
  }
  evalBezier(x, x_cp, y_cp) {
    if (x > x_cp[2]) {
      return x;
    }
    let a_x = x_cp[0] - 2*x_cp[1] + x_cp[2];
    let b_x = 2*x_cp[1] - 2*x_cp[2];
    let c_x = x_cp[2];
    let a_y = y_cp[0] - 2*y_cp[1] + y_cp[2];
    let b_y = 2*y_cp[1] - 2*y_cp[2];
    let c_y = y_cp[2];
    let d = Math.sqrt(b_x*b_x - 4 * a_x * (c_x - x));
    let t = (-b_x - d) / (2*a_x)
    return a_y*t*t + b_y*t + c_y;
  }
}
