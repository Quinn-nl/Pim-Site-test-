import { withPayload } from '@payloadcms/next/withPayload'

// Everything lives under /admin2 so the website's server can hand that prefix to this app unchanged.
const nextConfig = {
  basePath: '/admin2',
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
