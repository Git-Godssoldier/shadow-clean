"use client";

import { Button } from "@/components/ui/button";
import { useGitHubStatus } from "@/hooks/github/use-github-status";
import { useGitHubRepositories } from "@/hooks/github/use-github-repositories";
import { Loader2, Check, X, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

export function GitHubSettings() {
  const {
    data: githubStatus,
    isLoading: isLoadingGithub,
    refetch: refetchGithubStatus,
  } = useGitHubStatus();
  const { data: githubRepos, isLoading: isLoadingRepos } =
    useGitHubRepositories(!!githubStatus?.isAppInstalled);

  if (isLoadingGithub) {
    return (
      <div className="text-muted-foreground flex items-center gap-1">
        Loading... <Loader2 className="size-3.5 animate-spin" />
      </div>
    );
  }

  if (githubStatus?.isAppInstalled) {
    return (
      <>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            Connected <Check className="size-3.5 text-green-400" />
          </div>
          <Button className="w-auto" asChild>
            <Link
              href={`https://github.com/settings/installations/${githubStatus?.installationId}`}
              target="_blank"
            >
              Manage on GitHub <ArrowUpRight />
            </Link>
          </Button>
        </div>
        {isLoadingRepos ? (
          <div className="text-muted-foreground flex items-center gap-1">
            Loading Repositories...{" "}
            <Loader2 className="size-3.5 animate-spin" />
          </div>
        ) : githubRepos?.groups ? (
          <div className="flex w-full flex-col gap-3">
            <div className="font-medium">Your Repositories</div>
            <div className="flex w-full flex-col gap-2">
              {githubRepos.groups.map((group) => (
                <Fragment key={group.name}>
                  {group.repositories.slice(0, 10).map((repo) => (
                    <Button
                      key={repo.id}
                      variant="secondary"
                      className="w-full justify-between overflow-hidden"
                    >
                      <span className="truncate font-normal">
                        {repo.full_name}
                      </span>
                      <ArrowUpRight />
                    </Button>
                  ))}
                  {group.repositories.length > 10 && (
                    <div className="text-muted-foreground px-3 text-xs">
                      + {group.repositories.length - 10} more
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="text-destructive flex items-center gap-1.5">
          Not Connected <X className="size-3.5" />
        </div>
        <div className="text-muted-foreground">
          For full access, install Opulent OS into your organization. If you&apos;re
          seeing this and already installed, hit &apos;Save&apos; in Github.
        </div>
      </div>
      {githubStatus?.installationUrl && (
        <div className="flex gap-2">
          <Button className="w-auto" variant="secondary" asChild>
            <Link
              href={githubStatus?.installationUrl}
              target="_blank"
              className="font-normal"
            >
              Install Github App <ArrowUpRight />
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground w-auto font-normal"
            onClick={() => refetchGithubStatus()}
          >
            Refresh Status
          </Button>
        </div>
      )}
    </>
  );
}
