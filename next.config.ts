import type { NextConfig } from 'next'

// GitHub Pages serves this repository below /volnami-c7-v615/. Keep the
// normal local/temporary-host build root-relative; the Pages build supplies
// NEXT_PUBLIC_BASE_PATH at build time.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  outputFileTracingRoot: process.cwd(),
  // dev-индикатор Next лезет в углы скриншотов и мешает смотреть вёрстку
  devIndicators: false,
}

export default nextConfig
