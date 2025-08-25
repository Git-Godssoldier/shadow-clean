/**
 * Webpack Configuration for Temporal Workers
 * Optimized for production deployment with minimal bundle size
 */

const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: {
    worker: './src/workers/production-worker.ts'
  },
  
  target: 'node',
  
  output: {
    path: path.resolve(__dirname, 'dist/workers'),
    filename: '[name].bundle.js',
    library: {
      type: 'commonjs2'
    },
    clean: true
  },
  
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@workflows': path.resolve(__dirname, 'src/workflows'),
      '@activities': path.resolve(__dirname, 'src/activities'),
      '@clients': path.resolve(__dirname, 'src/clients'),
      '@workers': path.resolve(__dirname, 'src/workers'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@interceptors': path.resolve(__dirname, 'src/interceptors'),
      '@converters': path.resolve(__dirname, 'src/converters'),
      '@monitoring': path.resolve(__dirname, 'src/monitoring'),
      '@database': path.resolve(__dirname, 'src/database'),
      '@cache': path.resolve(__dirname, 'src/cache')
    }
  },
  
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, 'tsconfig.build.json'),
              transpileOnly: true, // Faster builds, skip type checking
              compilerOptions: {
                module: 'CommonJS',
                target: 'ES2022',
                strict: false,
                skipLibCheck: true,
                noEmit: false
              }
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  
  externals: {
    // Keep Temporal SDK external for proper operation
    '@temporalio/worker': '@temporalio/worker',
    '@temporalio/client': '@temporalio/client',
    '@temporalio/common': '@temporalio/common',
    '@temporalio/activity': '@temporalio/activity',
    
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
    'events': 'events'
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
          test: /src\/activities/,
          priority: 10
        },
        database: {
          name: 'database',
          test: /src\/(database|cache)/,
          priority: 8
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
      'process.env.WORKER_BUNDLE': JSON.stringify('true')
    }),
    
    // Ignore optional dependencies that might cause issues
    new webpack.IgnorePlugin({
      resourceRegExp: /^(pg-native|sqlite3|mysql2|oracledb|mongodb|redis-cluster)$/
    }),
    
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
      entryOnly: true
    })
  ],
  
  stats: {
    colors: true,
    modules: false,
    chunks: true,
    chunkModules: false,
    assets: true,
    performance: true,
    warnings: false
  },
  
  performance: {
    maxAssetSize: 1000000, // 1MB per asset
    maxEntrypointSize: 2000000, // 2MB per entry
    hints: 'warning'
  }
};