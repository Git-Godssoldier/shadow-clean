import { Router } from "express";
import { asyncHandler } from "./middleware";
import { FileSystemWatcher } from "../services/filesystem-watcher";
import { logger } from "../utils/logger";

export function createFileSystemWatcherRouter(
  fileSystemWatcher: FileSystemWatcher | null
): Router {
  const router = Router();

  /**
   * POST /api/watcher/pause
   * Pause filesystem watcher to prevent events during git operations
   */
  router.post(
    "/watcher/pause",
    asyncHandler(async (_req, res) => {
      if (!fileSystemWatcher) {
        return res.status(404).json({
          success: false,
          message: "Filesystem watcher not initialized",
        });
      }

      try {
        fileSystemWatcher.pause();
        logger.info("[FS_WATCHER_API] Filesystem watcher paused");

        return res.json({
          success: true,
          message: "Filesystem watcher paused successfully",
        });
      } catch (error) {
        logger.error("[FS_WATCHER_API] Failed to pause filesystem watcher", {
          error,
        });
        return res.status(500).json({
          success: false,
          message: "Failed to pause filesystem watcher",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  /**
   * POST /api/watcher/resume
   * Resume filesystem watcher after git operations are complete
   */
  router.post(
    "/watcher/resume",
    asyncHandler(async (_req, res) => {
      if (!fileSystemWatcher) {
        return res.status(404).json({
          success: false,
          message: "Filesystem watcher not initialized",
        });
      }

      try {
        fileSystemWatcher.resume();
        logger.info("[FS_WATCHER_API] Filesystem watcher resumed");

        return res.json({
          success: true,
          message: "Filesystem watcher resumed successfully",
        });
      } catch (error) {
        logger.error("[FS_WATCHER_API] Failed to resume filesystem watcher", {
          error,
        });
        return res.status(500).json({
          success: false,
          message: "Failed to resume filesystem watcher",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  /**
   * GET /api/watcher/status
   * Get filesystem watcher status
   */
  router.get(
    "/watcher/status",
    asyncHandler(async (_req, res) => {
      if (!fileSystemWatcher) {
        return res.json({
          success: true,
          data: {
            initialized: false,
            isPaused: null,
          },
        });
      }

      try {
        const isPaused = fileSystemWatcher.isPausedState();

        return res.json({
          success: true,
          data: {
            initialized: true,
            isPaused,
          },
        });
      } catch (error) {
        logger.error(
          "[FS_WATCHER_API] Failed to get filesystem watcher status",
          { error }
        );
        return res.status(500).json({
          success: false,
          message: "Failed to get filesystem watcher status",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  return router;
}
