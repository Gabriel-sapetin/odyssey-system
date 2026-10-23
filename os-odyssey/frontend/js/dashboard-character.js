(() => {
  const wrapper = document.querySelector('[data-motion-mascot]');
  if (!wrapper) return;

  const video = wrapper.querySelector('.home-character-motion-source');
  const canvas = wrapper.querySelector('.home-character-cutout');
  if (!video || !canvas) return;

  // Key the green screen in a fragment shader. This avoids copying every
  // frame back to JavaScript and looping over 130k pixels on the main thread.
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
  });
  if (!gl) return;

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

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

  gl.useProgram(program);
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  const texCoordLocation = gl.getAttribLocation(program, 'aTexCoord');
  const textureLocation = gl.getUniformLocation(program, 'uVideo');
  const vertices = new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
     1,  1, 1, 1,
  ]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(textureLocation, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.clearColor(0, 0, 0, 0);

  let frameCallbackPending = false;
  let sourceSize = '';
  let textureInitialized = false;

  function renderFrame() {
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

  function start() {
    if (video.paused) video.play().catch(() => {});
    if (!video.__cutoutFramesStarted) {
      video.__cutoutFramesStarted = true;
      scheduleFrame();
    }
  }

  video.addEventListener('play', start);
  video.addEventListener('loadeddata', start, { once: true });
  video.play().catch(() => {});
})();
