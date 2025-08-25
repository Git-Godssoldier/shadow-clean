import { IndexRepoOptions } from "@repo/types";
import {
  startBackgroundIndexing,
  getIndexingPromise,
} from "../initialization/background-indexing";
import express from "express";
import { isValidRepo } from "./utils/repository";
import { shadowWikiRouter } from "./shadowwiki/routes";

const router = express.Router();

// Mount the Shadow Wiki router
router.use("/shadowwiki", shadowWikiRouter);

router.post(
  "/index",
  async (
    req: express.Request<
      object,
      object,
      { repo: string; taskId: string; options: IndexRepoOptions }
    >,
    res,
    next,
  ) => {
    console.log("Indexing repo", req.body.repo);
    const { repo, taskId, options } = req.body;
    if (!repo || !isValidRepo(repo)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing repo parameter" });
    }

    try {
      // Start background indexing
      await startBackgroundIndexing(repo, taskId, {
        clearNamespace: options.clearNamespace ?? true,
        force: true, // Allow manual indexing to override recent indexing
      });

      // Wait for the indexing to complete
      const indexingPromise = getIndexingPromise(repo);
      if (indexingPromise) {
        console.log(
          `[INDEXING_API] Waiting for indexing to complete for ${repo}`,
        );
        await indexingPromise;
        console.log(`[INDEXING_API] Indexing completed for ${repo}`);
      }

      res.json({
        message: "Indexing completed successfully",
        repoFullName: repo,
        taskId: taskId,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("Not Found")) {
        return res.status(500).json({
          error: `Failed to start indexing: ${error.message}`,
        });
      }
      next(error);
    }
  },
);

export { router };
