// Only preloaded by the C7 local build command. Keep the shared Next config
// and installed dependencies untouched. This task discards webpack snapshots
// before every build, so writing another filesystem snapshot has no benefit.
const bundled = require('next/dist/compiled/webpack/webpack')
if (process.env.C7_LOW_MEMORY_BUILD === '1') {
  const { defaultConfig } = require('next/dist/server/config-shared')
  defaultConfig.experimental.webpackBuildWorker = false
  defaultConfig.experimental.cpus = 1
  defaultConfig.experimental.webpackMemoryOptimizations = true
}
const initialize = bundled.init
bundled.init = function (...args) {
  initialize.apply(this, args)
  const compile = bundled.webpack
  if (typeof compile !== 'function') throw new Error('Unsupported bundled webpack entry')
  bundled.webpack = new Proxy(compile, {
    apply(target, receiver, args) {
      const configs = Array.isArray(args[0]) ? args[0] : [args[0]]
      for (const config of configs) {
        if (!config || typeof config !== 'object') throw new Error('Missing webpack configuration')
        config.cache = false
        if (process.env.C7_LOW_MEMORY_BUILD === '1') config.parallelism = 8
        console.log(`[C7 local build] ${config.name ?? 'compiler'}: filesystem cache disabled`)
      }
      return Reflect.apply(target, receiver, args)
    },
  })
}
