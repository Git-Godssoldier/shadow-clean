export interface IndexRepoOptions {
  clearNamespace: boolean;
  force?: boolean;
}

export interface FileContentResponse {
  content: string;
  path: string;
  type: string;
}

export * from "./exclusions";
