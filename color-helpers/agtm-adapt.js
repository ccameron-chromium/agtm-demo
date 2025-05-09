let AgtmAdapt = function(metadata, headroom) {
  let altr_min = 0;
  let altr_max = metadata.altr.length - 1;

  while (altr_max - altr_min > 1) {
    let altr_mid = Math.round((altr_min + altr_max) / 2);
    if (headroom <= metadata.altr[altr_mid].headroom) {
      altr_max = altr_mid;
    }
    if (headroom >= metadata.altr[altr_mid].headroom) {
      altr_min = altr_mid;
    }
  }

  let w_min = 1.0;
  let w_max = 0.0;
  let h_min = metadata.altr[altr_min].headroom;
  let h_max = metadata.altr[altr_max].headroom;
  if (h_max > h_min) {
    w_max = clamp((headroom - h_min) / (h_max - h_min), 0.0, 1.0);
    w_min = 1.0 - w_max;
  }

  return {i:altr_min, j:altr_max, weight_i:w_min, weight_j:w_max};
}
