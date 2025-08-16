import { Request, Response, NextFunction } from "express";
import config from "../config";
import type { ProdConfig } from "../config/prod";

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  if (config.nodeEnv !== "production") {
    return next();
  }

  const authHeader = req.headers.authorization;
  const expectedApiKey = (config as ProdConfig).shadowApiKey;

  if (!authHeader) {
    return res.status(401).json({
      error: "Authorization header required",
      details: "Please provide Authorization: Bearer <api-key> header",
    });
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: "Invalid authorization format",
      details: "Expected format: Authorization: Bearer <api-key>",
    });
  }

  // Validate the API key
  if (token !== expectedApiKey) {
    return res.status(401).json({
      error: "Invalid API key",
      details: "The provided API key is not valid",
    });
  }

  // API key is valid, proceed to next middleware
  next();
};
