import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  outputFileTracingRoot: process.cwd(),
  // dev-индикатор Next лезет в углы скриншотов и мешает смотреть вёрстку
  devIndicators: false,
}

export default nextConfig
