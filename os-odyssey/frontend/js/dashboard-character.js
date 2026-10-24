(() => {
  const wrapper = document.querySelector('[data-motion-mascot]');
  if (!wrapper) return;

  const video = wrapper.querySelector('.home-character-motion-source');
  const canvas = wrapper.querySelector('.home-character-cutout');
  if (!video || !canvas) return;

  // Key the green screen in a fragment shader. This avoids copying every
  // frame back to JavaScript and looping over 130k pixels on the main thread.
  let gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
  });
  if (!gl) return;

  /* ── Mobile performance: throttle rendering to ~15fps ── */
  const IS_MOBILE = window.matchMedia('(max-width: 768px)').matches;
  const TARGET_FPS = IS_MOBILE ? 15 : 60;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  let lastFrameTime = 0;

  const vertexSource = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vTexCoord = aTexCoord;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform sampler2D uVideo;
    varying vec2 vTexCoord;
    void main() {
      vec4 color = texture2D(uVideo, vTexCoord);
      float spill = max(color.g - max(color.r, color.b), 0.0);
      if (spill <= 0.0784) {
        gl_FragColor = color;
      } else {
        float alpha = clamp(1.0 - spill, 0.0, 1.0);
        if (alpha < 0.0039) {
          gl_FragColor = vec4(0.0);
        } else {
          vec3 unkeyed = clamp((color.rgb - vec3(0.0, 1.0 - alpha, 0.0)) / alpha, 0.0, 1.0);
          gl_FragColor = vec4(unkeyed, alpha);
        }
      }
    }
  `;

  /* ── Track whether the GL context is currently valid ── */
  let contextLost = false;

  /* ── GL resource handles (rebuilt on context restore) ── */
  let program = null;
  let positionLocation = -1;
  let texCoordLocation = -1;
  let textureLocation = null;
  let buffer = null;
  let texture = null;

  const vertices = new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
     1,  1, 1, 1,
  ]);

  let frameCallbackPending = false;
  let sourceSize = '';
  let textureInitialized = false;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /** Create (or recreate) the entire GL pipeline: shaders, buffers, texture. */
  function initGL() {
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return false;

    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

    gl.useProgram(program);
    positionLocation = gl.getAttribLocation(program, 'aPosition');
    texCoordLocation = gl.getAttribLocation(program, 'aTexCoord');
    textureLocation = gl.getUniformLocation(program, 'uVideo');

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);

    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(textureLocation, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.clearColor(0, 0, 0, 0);

    /* Reset per-frame state so the next renderFrame() does a full texImage2D */
    textureInitialized = false;
    sourceSize = '';
    contextLost = false;

    return true;
  }

  /* ── Initial GL setup ── */
  if (!initGL()) return;

  function renderFrame() {
    if (contextLost) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || frameCallbackPending) return;
    frameCallbackPending = true;

    try {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;

      const dimensions = `${width}x${height}`;
      if (dimensions !== sourceSize) {
        const sourceRatio = width / height;
        const targetRatio = canvas.width / canvas.height;
        const uMin = sourceRatio > targetRatio ? (1 - targetRatio / sourceRatio) / 2 : 0;
        const uMax = sourceRatio > targetRatio ? 1 - uMin : 1;
        const vMin = sourceRatio < targetRatio ? (1 - sourceRatio / targetRatio) / 2 : 0;
        const vMax = sourceRatio < targetRatio ? 1 - vMin : 1;
        vertices[2] = uMin; vertices[3] = vMin;
        vertices[6] = uMax; vertices[7] = vMin;
        vertices[10] = uMin; vertices[11] = vMax;
        vertices[14] = uMax; vertices[15] = vMax;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
        sourceSize = dimensions;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (textureInitialized) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        textureInitialized = true;
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      wrapper.classList.add('has-motion-cutout');
    } catch (_) {
      // Keep the static penguin visible if a browser cannot upload video frames.
    } finally {
      frameCallbackPending = false;
    }
  }

  function scheduleFrame() {
    if (contextLost || video.paused || video.ended) return;
    if (typeof video.requestVideoFrameCallback === 'function' && !IS_MOBILE) {
      video.requestVideoFrameCallback(() => {
        renderFrame();
        scheduleFrame();
      });
    } else {
      requestAnimationFrame((timestamp) => {
        if (timestamp - lastFrameTime < FRAME_INTERVAL) {
          scheduleFrame();
          return;
        }
        lastFrameTime = timestamp;
        renderFrame();
        scheduleFrame();
      });
    }
  }

  function start() {
    if (contextLost) return;
    if (video.paused) video.play().catch(() => {});
    if (!video.__cutoutFramesStarted) {
      video.__cutoutFramesStarted = true;
      scheduleFrame();
    }
  }

  video.addEventListener('play', start);
  video.addEventListener('loadeddata', start, { once: true });
  video.play().catch(() => {});

  /* ── Handle WebGL context loss (bfcache, GPU reset, etc.) ── */
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();           // Allow the context to be restored later
    contextLost = true;
    video.__cutoutFramesStarted = false;
    wrapper.classList.remove('has-motion-cutout');   // Show the static PNG fallback
  });

  canvas.addEventListener('webglcontextrestored', () => {
    if (initGL()) {
      start();
    }
  });

  /* ── Handle bfcache page restore ── */
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    // The page was restored from the back/forward cache.
    // The WebGL context may have been lost and auto-restored already,
    // or it may still be lost. Either way, reset and restart.
    if (gl.isContextLost()) {
      // Context is still lost – the 'webglcontextrestored' listener will
      // handle re-init once the browser restores it. Just make sure the
      // fallback image is showing in the meantime.
      contextLost = true;
      video.__cutoutFramesStarted = false;
      wrapper.classList.remove('has-motion-cutout');
    } else {
      // Context survived (or was already restored before pageshow fired).
      // Re-init the pipeline to be safe and restart rendering.
      contextLost = false;
      video.__cutoutFramesStarted = false;
      textureInitialized = false;
      sourceSize = '';
      initGL();
      start();
    }
  });

  /* ── Pause when tab is hidden to save battery ── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      video.pause();
    } else {
      start();
    }
  });
})();
