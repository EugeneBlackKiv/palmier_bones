import {
  mat4,
  vec3,
  quat,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js'

export class PalmierSec extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <canvas id="gpu-canvas" width="760" height="760"></canvas>
    `
  }

  connectedCallback() {
    this.main()
  }

  async main() {
    // --- 1. SHADER WGSL ---
    const shaderCode = `
      struct Uniforms {
        modelViewMatrix: mat4x4f,
        projectionMatrix: mat4x4f,
      }
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var<storage, read> boneMatrices: array<mat4x4f>;
      @group(0) @binding(2) var myTexture: texture_2d<f32>;
      @group(0) @binding(3) var mySampler: sampler;
      
      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }
      
      @vertex
      fn vs_main(
        @location(0) position: vec3f,
        @location(1) joints: vec4u,
        @location(2) weights: vec4f,
        @location(3) uv: vec2f
      ) -> VertexOutput {
        let skinMatrix = 
          weights.x * boneMatrices[joints.x] +
          weights.y * boneMatrices[joints.y] +
          weights.z * boneMatrices[joints.z] +
          weights.w * boneMatrices[joints.w];
      
        var out: VertexOutput;
        let worldPos = uniforms.modelViewMatrix * skinMatrix * vec4f(position, 1.0);
        out.pos = uniforms.projectionMatrix * worldPos;
        out.uv = vec2f(uv.x, 1.0 - uv.y); 
        return out;
      }

      @fragment
      fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        let color = textureSample(myTexture, mySampler, uv);
        if (color.a < 0.1) { discard; }
        return color;
      }
    `

    // --- 2. SETUP WEBGPU ---
    const canvas = this.shadowRoot.getElementById('gpu-canvas')
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return console.error('WebGPU nu este suportat')
    const device = await adapter.requestDevice()
    const context = canvas.getContext('webgpu')
    const format = navigator.gpu.getPreferredCanvasFormat()
    context.configure({ device, format, alphaMode: 'premultiplied' })

    // --- 3. ÎNCĂRCARE DATE ---
    const [gltf, imgBitmap] = await Promise.all([
      fetch('./images/palmier4.gltf').then((r) => r.json()),
      fetch('./images/palmier.webp')
        .then((r) => r.blob())
        .then((b) => createImageBitmap(b, { imageOrientation: 'flipY' })), // ADAUGĂ ACEASTĂ OPȚIUNE
    ])

    const binResponse = await fetch(`./images/${gltf.buffers[0].uri}`)
    const binaryData = await binResponse.arrayBuffer()

    const getBufferData = (accessorIndex) => {
      if (accessorIndex === undefined) return null
      const accessor = gltf.accessors[accessorIndex]
      const bufferView = gltf.bufferViews[accessor.bufferView]
      const typeSize = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[
        accessor.type
      ]
      const byteOffset =
        (bufferView.byteOffset || 0) + (accessor.byteOffset || 0)
      if (accessor.componentType === 5123)
        return new Uint16Array(
          binaryData,
          byteOffset,
          accessor.count * typeSize
        )
      if (accessor.componentType === 5121)
        return new Uint8Array(binaryData, byteOffset, accessor.count * typeSize)
      return new Float32Array(binaryData, byteOffset, accessor.count * typeSize)
    }

    const primitive = gltf.meshes[0].primitives[0]
    const posData = getBufferData(primitive.attributes.POSITION)

    // --- ANALIZĂ BOUNDING BOX (Depanare automată) ---
    let min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < posData.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], posData[i + j])
        max[j] = Math.max(max[j], posData[i + j])
      }
    }
    const center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    const scaleFactor = size > 0 ? 2 / size : 1 // Încadrează modelul să ocupe ~75% din ecran

    // --- 4. RESURSE GPU ---
    const texture = device.createTexture({
      size: [imgBitmap.width, imgBitmap.height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    })
    device.queue.copyExternalImageToTexture(
      { source: imgBitmap },
      { texture },
      [imgBitmap.width, imgBitmap.height]
    )

    const createGPUBuffer = (data, usage) => {
      const buffer = device.createBuffer({
        size: data.byteLength,
        usage,
        mappedAtCreation: true,
      })
      new data.constructor(buffer.getMappedRange()).set(data)
      buffer.unmap()
      return buffer
    }

    const vertexBuffer = createGPUBuffer(posData, GPUBufferUsage.VERTEX)
    const indexBuffer = createGPUBuffer(
      getBufferData(primitive.indices),
      GPUBufferUsage.INDEX
    )
    const jointsBuffer = createGPUBuffer(
      new Uint32Array(getBufferData(primitive.attributes.JOINTS_0)),
      GPUBufferUsage.VERTEX
    )
    const weightsBuffer = createGPUBuffer(
      getBufferData(primitive.attributes.WEIGHTS_0),
      GPUBufferUsage.VERTEX
    )
    const uvBuffer = createGPUBuffer(
      getBufferData(primitive.attributes.TEXCOORD_0),
      GPUBufferUsage.VERTEX
    )

    const boneCount = gltf.skins[0].joints.length
    const boneMatricesData = new Float32Array(boneCount * 16)
    const boneStorageBuffer = device.createBuffer({
      size: boneMatricesData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    const uniformBuffer = device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const depthTexture = device.createTexture({
      size: [760, 760],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: shaderCode }),
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
          {
            arrayStride: 16,
            attributes: [{ shaderLocation: 1, offset: 0, format: 'uint32x4' }],
          },
          {
            arrayStride: 16,
            attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }],
          },
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code: shaderCode }),
        entryPoint: 'fs_main',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    })

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: boneStorageBuffer } },
        { binding: 2, resource: texture.createView() },
        {
          binding: 3,
          resource: device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
          }),
        },
      ],
    })

    // --- 5. ANIMATIE ---
    const ibmDataRaw = getBufferData(gltf.skins[0].inverseBindMatrices)
    const inverseBindMatrices = Array.from({ length: boneCount }, (_, i) =>
      ibmDataRaw.subarray(i * 16, i * 16 + 16)
    )
    const globalNodeMatrices = new Array(gltf.nodes.length)
    const animation = gltf.animations[0]
    let maxTime = 0
    animation.samplers.forEach((s) => {
      const t = getBufferData(s.input)
      maxTime = Math.max(maxTime, t[t.length - 1])
    })

    function interpolate(channel, time) {
      const samp = animation.samplers[channel.sampler]
      const times = getBufferData(samp.input),
        values = getBufferData(samp.output)
      let i = 0
      while (i < times.length - 2 && time >= times[i + 1]) i++
      const t = Math.max(
        0,
        Math.min(1, (time - times[i]) / (times[i + 1] - times[i]))
      )
      if (channel.target.path === 'rotation') {
        return quat.slerp(
          values.subarray(i * 4, i * 4 + 4),
          values.subarray((i + 1) * 4, (i + 1) * 4 + 4),
          t,
          quat.create()
        )
      }
      return vec3.lerp(
        values.subarray(i * 3, i * 3 + 3),
        values.subarray((i + 1) * 3, (i + 1) * 3 + 3),
        t,
        vec3.create()
      )
    }

    function computeTransforms(nodeIndex, parentMat, time) {
      const node = gltf.nodes[nodeIndex]
      let tr = node.translation
        ? vec3.create(...node.translation)
        : vec3.create(0, 0, 0)
      let rt = node.rotation
        ? quat.create(...node.rotation)
        : quat.create(0, 0, 0, 1)
      let sc = node.scale ? vec3.create(...node.scale) : vec3.create(1, 1, 1)
      animation.channels.forEach((c) => {
        if (c.target.node === nodeIndex) {
          const v = interpolate(c, time)
          if (c.target.path === 'translation') tr = v
          else if (c.target.path === 'rotation') rt = v
          else sc = v
        }
      })
      const local = mat4.identity()
      mat4.translate(local, tr, local)
      mat4.multiply(local, mat4.fromQuat(rt), local)
      mat4.scale(local, sc, local)
      const global = mat4.multiply(parentMat, local)
      globalNodeMatrices[nodeIndex] = global
      if (node.children)
        node.children.forEach((c) => computeTransforms(c, global, time))
    }

    // --- 6. RENDER LOOP ---
    const frame = (timestamp) => {
      const time = (timestamp / 1000) % maxTime
      gltf.scenes[0].nodes.forEach((n) =>
        computeTransforms(n, mat4.identity(), time)
      )
      for (let i = 0; i < boneCount; i++) {
        boneMatricesData.set(
          mat4.multiply(
            globalNodeMatrices[gltf.skins[0].joints[i]],
            inverseBindMatrices[i]
          ),
          i * 16
        )
      }
      device.queue.writeBuffer(boneStorageBuffer, 0, boneMatricesData)

      // PROIECȚIE ORTOGRAFICĂ
      const projection = mat4.ortho(-1, 1, -1, 1, -5, 5)

      // MODEL VIEW - Centrare automată și Scalare
      const modelView = mat4.identity()
      mat4.scale(modelView, [scaleFactor, scaleFactor, scaleFactor], modelView)
      mat4.translate(modelView, [-center[0], -center[1], -center[2]], modelView)

      device.queue.writeBuffer(uniformBuffer, 0, modelView)
      device.queue.writeBuffer(uniformBuffer, 64, projection)

      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 }, // alpha = 0 pentru transparent
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bindGroup)
      pass.setVertexBuffer(0, vertexBuffer)
      pass.setVertexBuffer(1, jointsBuffer)
      pass.setVertexBuffer(2, weightsBuffer)
      pass.setVertexBuffer(3, uvBuffer)
      pass.setIndexBuffer(indexBuffer, 'uint16')
      pass.drawIndexed(getBufferData(primitive.indices).length)
      pass.end()
      device.queue.submit([encoder.finish()])
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
}
customElements.define('palmier-sec', PalmierSec)
