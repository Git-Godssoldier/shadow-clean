/**
 * Webpack Configuration for Temporal Workflows
 * Optimized for production bundling with code splitting
 */

const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: {
    workflows: './src/workflows/index.ts',
  },
  
  target: 'node',
  
  output: {
    path: path.resolve(__dirname, 'dist/workflows'),
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
      '@monitoring': path.resolve(__dirname, 'src/monitoring')
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
              configFile: path.resolve(__dirname, 'tsconfig.json'),
              transpileOnly: false,
              compilerOptions: {
                module: 'ESNext',
                target: 'ES2022',
                moduleResolution: 'node',
                strict: false, // Relax strict mode for bundling
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
    // Externalize Temporal SDK to avoid bundling issues
    '@temporalio/workflow': '@temporalio/workflow',
    '@temporalio/common': '@temporalio/common',
    '@temporalio/activity': '@temporalio/activity',
    
    // Node.js built-ins
    'fs': 'fs',
    'path': 'path',
    'crypto': 'crypto',
    'util': 'util',
    'os': 'os'
  },
  
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        workflows: {
          name: 'workflows',
          test: /src\/workflows/,
          priority: 10
        },
        temporal: {
          name: 'temporal',
          test: /node_modules\/@temporalio/,
          priority: 20
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
      'process.env.TEMPORAL_BUNDLE': JSON.stringify('true')
    }),
    
    new webpack.IgnorePlugin({
      resourceRegExp: /^(pg-native|sqlite3|mysql2|oracledb)$/
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
    performance: true
  },
  
  performance: {
    maxAssetSize: 512000, // 512KB per asset
    maxEntrypointSize: 1024000, // 1MB per entry
    hints: 'warning'
  }
};