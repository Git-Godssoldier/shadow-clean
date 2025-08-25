import { Router } from "express";
import { asyncHandler } from "./middleware";
import { GitService } from "../services/git-service";
import {
  GitCloneRequestSchema,
  GitConfigRequestSchema,
  GitBranchRequestSchema,
  GitCommitRequestSchema,
  GitPushRequestSchema,
} from "@repo/types";

export function createGitRouter(gitService: GitService): Router {
  const router = Router();

  /**
   * POST /api/git/clone
   * Clone repository to workspace
   */
  router.post(
    "/api/git/clone",
    asyncHandler(async (req, res) => {
      const { repoUrl, branch, githubToken } = GitCloneRequestSchema.parse(
        req.body
      );

      const result = await gitService.cloneRepository(
        repoUrl,
        branch,
        githubToken
      );

      if (!result.success) {
        const statusCode = result.error === "CLONE_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * POST /api/git/config
   * Configure git user credentials
   */
  router.post(
    "/api/git/config",
    asyncHandler(async (req, res) => {
      const { name, email } = GitConfigRequestSchema.parse(req.body);

      const result = await gitService.configureUser({ name, email });

      if (!result.success) {
        const statusCode = result.error === "CONFIG_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * POST /api/git/branch
   * Create and switch to shadow branch
   */
  router.post(
    "/api/git/branch",
    asyncHandler(async (req, res) => {
      const { baseBranch, shadowBranch } = GitBranchRequestSchema.parse(
        req.body
      );

      const result = await gitService.createShadowBranch(
        baseBranch,
        shadowBranch
      );

      if (!result.success) {
        const statusCode = result.error === "BRANCH_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * GET /api/git/status
   * Check for uncommitted changes
   */
  router.get(
    "/api/git/status",
    asyncHandler(async (_req, res) => {
      const result = await gitService.hasChanges();

      if (!result.success) {
        const statusCode = result.error === "STATUS_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * GET /api/git/diff
   * Get current git diff for commit message generation
   */
  router.get(
    "/api/git/diff",
    asyncHandler(async (_req, res) => {
      const result = await gitService.getDiff();

      if (!result.success) {
        const statusCode = result.error === "DIFF_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * POST /api/git/diff-against-base
   * Get git diff against a base branch for PR generation
   */
  router.post(
    "/api/git/diff-against-base",
    asyncHandler(async (req, res) => {
      const { baseBranch } = req.body;

      if (!baseBranch || typeof baseBranch !== "string") {
        res.status(400).json({
          success: false,
          message: "baseBranch is required and must be a string",
          error: "INVALID_REQUEST",
        });
        return;
      }

      const result = await gitService.getDiffAgainstBase(baseBranch);

      if (!result.success) {
        const statusCode = result.error === "DIFF_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * POST /api/git/checkout
   * Safely checkout to a specific commit SHA
   */
  router.post(
    "/api/git/checkout",
    asyncHandler(async (req, res) => {
      const { commitSha } = req.body;

      if (!commitSha || typeof commitSha !== "string") {
        res.status(400).json({
          success: false,
          message: "commitSha is required and must be a string",
          error: "INVALID_REQUEST",
        });
        return;
      }

      const result = await gitService.safeCheckoutCommit(commitSha);

      if (!result.success) {
        const statusCode =
          result.error === "COMMIT_NOT_FOUND"
            ? 404
            : result.error === "CHECKOUT_FAILED"
              ? 500
              : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * POST /api/git/commit-messages
   * Get recent commit messages from current branch compared to base branch
   */
  router.post(
    "/api/git/commit-messages",
    asyncHandler(async (req, res) => {
      const { baseBranch, limit } = req.body;

      if (!baseBranch || typeof baseBranch !== "string") {
        res.status(400).json({
          success: false,
          message: "baseBranch is required and must be a string",
          error: "INVALID_REQUEST",
        });
        return;
      }

      const result = await gitService.getRecentCommitMessages(
        baseBranch,
        limit && typeof limit === "number" ? limit : 5
      );

      if (!result.success) {
        const statusCode =
          result.error === "COMMIT_MESSAGES_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * GET /api/git/current-branch
   * Get the current branch name
   */
  router.get(
    "/api/git/current-branch",
    asyncHandler(async (_req, res) => {
      const result = await gitService.getCurrentBranch();

      if (!result.success) {
        const statusCode = result.error === "BRANCH_INFO_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * GET /api/git/current-commit
   * Get the current commit SHA
   */
  router.get(
    "/api/git/current-commit",
    asyncHandler(async (_req, res) => {
      const result = await gitService.getCurrentCommitShaPublic();

      if (!result.success) {
        const statusCode = result.error === "COMMIT_INFO_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * POST /api/git/commit
   * Commit changes with AI-generated message and co-authoring
   */
  router.post(
    "/api/git/commit",
    asyncHandler(async (req, res) => {
      const { user, coAuthor, message } = GitCommitRequestSchema.parse(
        req.body
      );

      const result = await gitService.commitChanges({
        user,
        coAuthor,
        message,
      });

      if (!result.success) {
        const statusCode = result.error === "COMMIT_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * POST /api/git/push
   * Push current branch to remote repository
   */
  router.post(
    "/api/git/push",
    asyncHandler(async (req, res) => {
      const { branchName, setUpstream } = GitPushRequestSchema.parse(req.body);

      const result = await gitService.pushBranch(branchName, setUpstream);

      if (!result.success) {
        const statusCode = result.error === "PUSH_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  /**
   * POST /api/git/file-changes
   * Get file changes since base branch
   */
  router.post(
    "/api/git/file-changes",
    asyncHandler(async (req, res) => {
      const { baseBranch } = req.body;

      if (!baseBranch || typeof baseBranch !== "string") {
        res.status(400).json({
          success: false,
          message: "baseBranch is required and must be a string",
          error: "INVALID_REQUEST",
          fileChanges: [],
          diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
        });
        return;
      }

      const result = await gitService.getFileChanges(baseBranch);

      if (!result.success) {
        const statusCode = result.error === "FILE_CHANGES_FAILED" ? 500 : 400;
        res.status(statusCode).json(result);
      } else {
        res.json(result);
      }
    })
  );

  return router;
}
