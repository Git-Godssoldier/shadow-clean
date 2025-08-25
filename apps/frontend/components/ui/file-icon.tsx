import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

import JavascriptIcon from "material-icon-theme/icons/javascript.svg";
import TypescriptIcon from "material-icon-theme/icons/typescript.svg";
import ReactTsIcon from "material-icon-theme/icons/react_ts.svg";
import ReactJsIcon from "material-icon-theme/icons/react.svg";
import HtmlIcon from "material-icon-theme/icons/html.svg";
import CssIcon from "material-icon-theme/icons/css.svg";
import JsonIcon from "material-icon-theme/icons/json.svg";
import MarkdownIcon from "material-icon-theme/icons/markdown.svg";
import PythonIcon from "material-icon-theme/icons/python.svg";
import YamlIcon from "material-icon-theme/icons/yaml.svg";
import DockerIcon from "material-icon-theme/icons/docker.svg";
import GitIcon from "material-icon-theme/icons/git.svg";
import NpmIcon from "material-icon-theme/icons/npm.svg";
import NextIcon from "material-icon-theme/icons/next.svg";
import SettingsIcon from "material-icon-theme/icons/settings.svg";
import TailwindIcon from "material-icon-theme/icons/tailwindcss.svg";
import ViteIcon from "material-icon-theme/icons/vite.svg";
import SvgIcon from "material-icon-theme/icons/svg.svg";
import FaviconIcon from "material-icon-theme/icons/favicon.svg";
import GithubActionsIcon from "material-icon-theme/icons/github-actions-workflow.svg";
import VercelIcon from "material-icon-theme/icons/vercel.svg";
import GoIcon from "material-icon-theme/icons/go.svg";
import RustIcon from "material-icon-theme/icons/rust.svg";
import JavaIcon from "material-icon-theme/icons/java.svg";
import YarnIcon from "material-icon-theme/icons/yarn.svg";
import PnpmIcon from "material-icon-theme/icons/pnpm.svg";
import { File } from "lucide-react";

// Map file extensions and names to imported SVG components
const getFileIcon = (filename: string) => {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  const baseName = filename.toLowerCase();

  // Special filenames first
  if (baseName === "package.json") return NpmIcon;
  if (baseName === "dockerfile") return DockerIcon;
  if (baseName === ".gitignore" || baseName === ".gitattributes")
    return GitIcon;

  // Config files
  if (baseName === "next.config.js" || baseName === "next.config.ts")
    return NextIcon;
  if (baseName === "tailwind.config.js" || baseName === "tailwind.config.ts")
    return TailwindIcon;
  if (baseName === "vite.config.js" || baseName === "vite.config.ts")
    return ViteIcon;
  if (baseName.startsWith(".env")) return SettingsIcon;
  if (baseName === "vercel.json") return VercelIcon;

  // Lock files
  if (baseName === "yarn.lock") return YarnIcon;
  if (baseName === "pnpm-lock.yaml") return PnpmIcon;

  // GitHub workflows - check if path includes .github/workflows
  if (
    filename.includes(".github/workflows/") &&
    (extension === "yml" || extension === "yaml")
  ) {
    return GithubActionsIcon;
  }

  // Extensions
  switch (extension) {
    case "jsx":
      return ReactJsIcon;
    case "js":
    case "mjs":
    case "cjs":
      return JavascriptIcon;
    case "tsx":
      return ReactTsIcon;
    case "ts":
      return TypescriptIcon;
    case "html":
    case "htm":
      return HtmlIcon;
    case "css":
    case "scss":
    case "sass":
      return CssIcon;
    case "json":
      return JsonIcon;
    case "md":
    case "mdx":
      return MarkdownIcon;
    case "py":
      return PythonIcon;
    case "yml":
    case "yaml":
      return YamlIcon;
    case "svg":
      return SvgIcon;
    case "ico":
      return FaviconIcon;
    case "go":
      return GoIcon;
    case "rs":
      return RustIcon;
    case "java":
      return JavaIcon;
    default:
      return null;
  }
};

export function FileIcon({
  filename,
  className,
  style,
  useFallback = false,
}: {
  filename: string;
  className?: string;
  style?: React.CSSProperties;
  useFallback?: boolean;
}) {
  const IconComponent = useMemo(() => getFileIcon(filename), [filename]);

  if (IconComponent) {
    return (
      <IconComponent className={cn("shrink-0", className)} style={style} />
    );
  }

  // Return null for unsupported file types (no fallback)
  return useFallback ? (
    <File className={cn("shrink-0", className)} style={style} />
  ) : null;
}
