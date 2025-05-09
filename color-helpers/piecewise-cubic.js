class PiecewiseCubic {
  constructor(control_points) {
    this.control_points = structuredClone(control_points);
  }

  getControlPoints() {
    return this.control_points;
  }
  
  insert(x) {
    let p = this.evaluate(x);
    let i = 0;
    while (this.control_points.length > i &&
           this.control_points[i].x < p.x) {
      ++i;
    }
    this.control_points.splice(i, 0, p);
  }
  remove(index) {
    if (index == null) {
      return;
    }
    this.control_points.splice(index, 1);
  }
  evaluate(x) {
    let result = {x:x};
    const n = this.control_points.length;
    if (x <= this.control_points[0].x) {
      result.y = this.control_points[0].y;
      result.m = 0;
      return result;
    }
    if (x >= this.control_points[n-1].x) {
      let xym = this.control_points[n-1];
      result.y = log2(exp2(xym.y) * xym.x / x);
      result.m = 0;
      return result;
    }
    for (let i = 0; i < n - 1; ++i) {
      if (x <= this.control_points[i+1].x) {
        let x0 = this.control_points[i].x; let x1 = this.control_points[i+1].x;
        let y0 = this.control_points[i].y; let y1 = this.control_points[i+1].y;
        let m0 = this.control_points[i].m; let m1 = this.control_points[i+1].m;
        
        // Normalize to the unit interval
        const t = (x - x0) / (x1 - x0);
        m0 *= (x1 - x0);
        m1 *= (x1 - x0);
   
        // Compute cubic coefficients and evaluate.
        const c3 = (2.0*y0 + m0 - 2.0*y1 + m1);
        const c2 = (-3.0*y0 + 3.0*y1 - 2.0*m0 - m1);
        const c1 = m0;
        const c0 = y0;
        result.y = c0 + t*(c1 + t*(c2 + t*c3));
        result.m = (c1 + 2*c2*t + 3*c3*t*t) / (x1 - x0);
        return result;
      }
    }
    console.log('oops');
  }
}
