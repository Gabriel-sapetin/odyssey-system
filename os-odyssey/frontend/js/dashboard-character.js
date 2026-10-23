(() => {
  const mascots = document.querySelectorAll('[data-motion-mascot]');

  function setupCutout(wrapper) {
    const video = wrapper.querySelector('.home-character-motion-source');
    const canvas = wrapper.querySelector('.home-character-cutout');
    if (!video || !canvas) return;

    const output = canvas.getContext('2d', { alpha: true });
    const work = document.createElement('canvas');
    work.width = canvas.width;
    work.height = canvas.height;
    const workContext = work.getContext('2d', { willReadFrequently: true });
    if (!output || !workContext) return;

    const width = work.width;
    const height = work.height;
    let framePending = false;

    // A green screen separates cleanly from the penguin's black, white, blue,
    // and yellow colors. Estimate transparency from excess green, then unmix
    // the green channel on soft edges to avoid a bright green fringe.
    function removeGreenScreen(data) {
      for (let offset = 0; offset < data.length; offset += 4) {
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const spill = green - Math.max(red, blue);
        if (spill <= 20) continue;

        const alpha = Math.max(0, Math.min(255, Math.round(255 - spill)));
        data[offset + 3] = alpha;
        if (alpha === 0) continue;

        const scale = 255 / alpha;
        data[offset] = Math.min(255, Math.round(red * scale));
        data[offset + 2] = Math.min(255, Math.round(blue * scale));
        data[offset + 1] = Math.max(0, Math.min(255,
          Math.round((green * 255 - (255 - alpha) * 255) / alpha)));
      }
    }

    function renderFrame() {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || framePending) return;
      framePending = true;

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) {
        framePending = false;
        return;
      }

      const targetRatio = width / height;
      const sourceRatio = sourceWidth / sourceHeight;
      let sx = 0;
      let sy = 0;
      let sw = sourceWidth;
      let sh = sourceHeight;
      if (sourceRatio > targetRatio) {
        sw = sourceHeight * targetRatio;
        sx = (sourceWidth - sw) / 2;
      } else {
        sh = sourceWidth / targetRatio;
        sy = (sourceHeight - sh) / 2;
      }

      workContext.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      const frame = workContext.getImageData(0, 0, width, height);
      removeGreenScreen(frame.data);

      output.putImageData(frame, 0, 0);
      wrapper.classList.add('has-motion-cutout');
      framePending = false;
    }

    function scheduleFrame() {
      if (video.paused || video.ended) return;
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => {
          renderFrame();
          scheduleFrame();
        });
      } else {
        requestAnimationFrame(() => {
          renderFrame();
          scheduleFrame();
        });
      }
    }

    video.addEventListener('play', () => {
      renderFrame();
      if (!video.__cutoutFramesStarted) {
        video.__cutoutFramesStarted = true;
        scheduleFrame();
      }
    });
    video.addEventListener('loadeddata', () => {
      renderFrame();
      // Some mobile browsers finish loading the first frame before firing
      // `play`; retry here so the visible phone mascot cannot stay on fallback.
      if (video.paused) video.play().catch(() => {});
      else if (!video.__cutoutFramesStarted) {
        video.__cutoutFramesStarted = true;
        scheduleFrame();
      }
    }, { once: true });
    video.addEventListener('canplay', () => {
      if (video.paused) video.play().catch(() => {});
    }, { once: true });
    video.play().catch(() => {});
  }

  // Start both responsive placements. Mobile emulation can change viewport
  // dimensions after this script runs, so a one-time matchMedia choice can
  // accidentally animate only the hidden desktop mascot.
  mascots.forEach(setupCutout);
})();
