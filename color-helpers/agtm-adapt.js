let AgtmAdapt = function(headroomAdaptiveToneMap, H_target) {
  // Create the list of HDR headrooms including the baseline image and all alternate images, as
  // described Clause 6.2.5 Computation of the headroom-adaptive tone map.

  // Let N be the length of the combined list.
  let N = 0;

  // Let H be the sorted list of HDR headrooms. Let indices list the alternate
  // image index of each entry of H. The index for the baseline image is
  // kInvalidIndex.
  let H = [];
  let indices = [];
  const kInvalidIndex = -1;

  const H_baseline = headroomAdaptiveToneMap.baselineHdrHeadroom;
  const alternateImages = headroomAdaptiveToneMap.alternateImages;
  for (let i = 0; i < alternateImages.length; ++i) {
    if (N == i && H_baseline < alternateImages[i].hdrHeadroom) {
        // Insert the baseline HDR headroom before the indices as they are visited.
        indices[N] = kInvalidIndex;
        H[N++] = H_baseline;
    }
    indices[N] = i;
    H[N] = alternateImages[i].hdrHeadroom;
    N += 1;
  }
  if (N == alternateImages.length) {
      // Insert the baseline HDR headroom at the end if it has not yet been inserted.
      indices[N] = kInvalidIndex;
      H[N++] = H_baseline;
  }

  // Find the indices for the contributing images.
  let result = null;
  if (H_target <= H[0]) {
      // One case of Formula (2), for the left endpoint.
      result = [{index:indices[0], weight:1}];
  } else if (H_target >= H[N-1]) {
      // The other case of Formula (2), for the right endpoint.
      result = [{index:indices[N-1], weight:1}];
  } else {
      // The case of Formula (3).
      for (let i = 0; i < N - 1; ++i) {
          if (H[i] <= H_target && H_target <= H[i+1]) {
              result = [
                  {
                      index:indices[i],
                      weight:(H[i+1] - H_target) / (H[i+1] - H[i])
                  },
                  {
                      index:indices[i+1],
                      weight:(H_target - H[i]) / (H[i+1] - H[i])
                  }
              ];
              break;
          }
      }
  }

  // Remove entries with weight 0, and remove entries for the baseline image.
  result = result.filter(item => item.index !== kInvalidIndex);
  result = result.filter(item => item.weight !== 0);
  return result;

  
  let altr_min = 0;
  let altr_max = headroomAdaptiveToneMap.alternateImages.length;

  while (altr_max - altr_min > 1) {
    let altr_mid = Math.round((altr_min + altr_max) / 2);
    if (headroom <= headroomAdaptiveToneMap.alternateImages[altr_mid].hdrHeadroom) {
      altr_max = altr_mid;
    }
    if (headroom >= headroomAdaptiveToneMap.alternateImages[altr_mid].hdrHeadroom) {
      altr_min = altr_mid;
    }
  }

  let w_min = 1.0;
  let w_max = 0.0;
  let h_min = headroomAdaptiveToneMap.alternateImages[altr_min].hdrHeadroom;
  let h_max = headroomAdaptiveToneMap.alternateImages[altr_max].hdrHeadroom;
  if (h_max > h_min) {
    w_max = clamp((headroom - h_min) / (h_max - h_min), 0.0, 1.0);
    w_min = 1.0 - w_max;
  }

  return {i:altr_min, j:altr_max, weight_i:w_min, weight_j:w_max};
}
