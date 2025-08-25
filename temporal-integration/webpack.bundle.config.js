/**
 * Webpack Configuration for Bundling Existing JavaScript Output
 * Works with the compiled JavaScript from tsc to create optimized bundles
 */

const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: {
    // Use the existing JavaScript compiled output
    'production-worker': './dist/workers/production-worker.js',
    'data-pipeline-workflow': './dist/workflows/data-pipeline.workflow.js'
  },
  
  target: 'node',
  
  output: {
    path: path.resolve(__dirname, 'dist/bundles'),
    filename: '[name].bundle.js',
    library: {
      type: 'commonjs2'
    },
    clean: true
  },
  
  resolve: {
    extensions: ['.js', '.json'],
    modules: ['node_modules', path.resolve(__dirname, 'dist')]
  },
  
  externals: {
    // Keep Temporal SDK external for proper operation
    '@temporalio/worker': '@temporalio/worker',
    '@temporalio/client': '@temporalio/client',
    '@temporalio/common': '@temporalio/common',
    '@temporalio/activity': '@temporalio/activity',
    '@temporalio/workflow': '@temporalio/workflow',
    
    // Database drivers - these should be installed separately
    'pg': 'pg',
    'ioredis': 'ioredis',
    
    // Node.js built-ins
    'fs': 'fs',
    'path': 'path',
    'crypto': 'crypto',
    'util': 'util',
    'os': 'os',
    'stream': 'stream',
    'events': 'events',
    'http': 'http',
    'https': 'https',
    'url': 'url',
    'querystring': 'querystring'
  },
  
  optimization: {
    minimize: true,
    usedExports: true,
    sideEffects: false,
    splitChunks: {
      chunks: 'all',
      minSize: 20000,
      maxSize: 500000,
      cacheGroups: {
        activities: {
          name: 'activities',
          test: /activities\//,
          priority: 10
        },
        database: {
          name: 'database',
          test: /(database|cache)\//,
          priority: 8
        },
        utils: {
          name: 'utils',
          test: /utils\//,
          priority: 6
        },
        vendor: {
          name: 'vendor',
          test: /node_modules/,
          priority: 5
        }
      }
    }
  },
  
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.WORKER_BUNDLE': JSON.stringify('true'),
      'process.env.WEBPACK_BUNDLED': JSON.stringify('true')
    }),
    
    // Ignore optional dependencies that might cause bundling issues
    new webpack.IgnorePlugin({
      resourceRegExp: /^(pg-native|sqlite3|mysql2|oracledb|mongodb|redis-cluster|dtrace-provider|@newrelic\/native-metrics|@opentelemetry\/instrumentation-fs)$/
    }),
    
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
      entryOnly: true
    }),
    
    // Provide polyfills for Node.js globals
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    })
  ],
  
  stats: {
    colors: true,
    modules: false,
    chunks: true,
    chunkModules: false,
    assets: true,
    performance: true,
    warnings: false,
    errors: true,
    errorDetails: true
  },
  
  performance: {
    maxAssetSize: 1000000, // 1MB per asset
    maxEntrypointSize: 2000000, // 2MB per entry
    hints: 'warning'
  },
  
  devtool: 'source-map' // Include source maps for debugging
};