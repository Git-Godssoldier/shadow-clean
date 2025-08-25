"use server";

import { IndexRepoOptions } from "@repo/types";
import { makeBackendRequest } from "../make-backend-request";

export async function fetchIndexApi({
  repoFullName,
  taskId,
  clearNamespace = true,
  ...otherOptions
}: {
  repoFullName: string;
  taskId: string;
} & Partial<IndexRepoOptions>) {
  const response = await makeBackendRequest(`/api/indexing/index`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // Force is used because the only case this is called is when we manually index a repo
    body: JSON.stringify({
      repo: repoFullName,
      taskId: taskId,
      options: {
        clearNamespace,
        force: true,
        ...otherOptions,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Indexing failed: ${errorData.error || response.statusText}`
    );
  }

  const data = await response.json();
  return data;
}
