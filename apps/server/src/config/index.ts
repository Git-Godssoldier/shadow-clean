import type { DevConfig } from "./dev";
import type { ProdConfig } from "./prod";

const nodeEnv = process.env.NODE_ENV || "development";

let config: DevConfig | ProdConfig;

if (nodeEnv === "production") {
  // Production environment: Use remote execution configuration
  console.log("[CONFIG] Loading production configuration (Remote mode)");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: prodConfig } = require("./prod");
  config = prodConfig;
} else {
  // Development/test environment: Use local-focused configuration
  const { default: devConfig } = require("./dev");
  config = devConfig;
}

export default config;

export type { DevConfig } from "./dev";
export type { ProdConfig } from "./prod";
export type { SharedConfig } from "./shared";
export { getCorsOrigins } from "./shared";
