import { ToolExecutor } from "@/execution/interfaces/tool-executor";
import { FileNode, RecursiveDirectoryEntry } from "@repo/types";

/**
 * Convert a flat list of recursive directory entries into a hierarchical tree structure
 */
export function buildTreeFromEntries(entries: RecursiveDirectoryEntry[]): FileNode[] {
  const nodeMap = new Map<string, FileNode>();
  const rootNodes: FileNode[] = [];

  // Sort entries to process directories before files
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.relativePath.localeCompare(b.relativePath);
  });

  for (const entry of sortedEntries) {
    const displayPath = entry.relativePath.startsWith("./")
      ? entry.relativePath.slice(1)
      : `/${entry.relativePath}`;

    const node: FileNode = {
      name: entry.name,
      type: entry.isDirectory ? "folder" : "file",
      path: displayPath,
      children: entry.isDirectory ? [] : undefined,
    };

    nodeMap.set(entry.relativePath, node);

    // Find parent directory
    const parentPath = entry.relativePath.includes("/")
      ? entry.relativePath.substring(0, entry.relativePath.lastIndexOf("/"))
      : "";

    if (parentPath === "" || parentPath === ".") {
      // This is a root-level entry
      rootNodes.push(node);
    } else {
      // This is a nested entry, add it to parent's children
      const parent = nodeMap.get(parentPath);
      if (parent && parent.children) {
        parent.children.push(node);
      }
    }
  }

  // Remove empty folders (folders with no children after filtering ignored dirs)
  const filterEmptyFolders = (nodes: FileNode[]): FileNode[] => {
    return nodes.filter((node) => {
      if (node.type === "folder") {
        if (node.children) {
          node.children = filterEmptyFolders(node.children);
          return node.children.length > 0;
        }
        return false;
      }
      return true;
    });
  };

  const filteredNodes = filterEmptyFolders(rootNodes);

  // Sort: folders first, then files, both alphabetically
  const sortNodes = (nodes: FileNode[]): FileNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Recursively sort children
    for (const node of nodes) {
      if (node.children) {
        node.children = sortNodes(node.children);
      }
    }

    return nodes;
  };

  return sortNodes(filteredNodes);
}

export async function buildFileTree(
  executor: ToolExecutor,
  dirPath: string = "."
): Promise<FileNode[]> {
  try {
    const recursiveListing = await executor.listDirectoryRecursive(dirPath);

    if (!recursiveListing.success) {
      console.error("[FILE_TREE_ERROR]", recursiveListing.error);
      return [];
    }

    return buildTreeFromEntries(recursiveListing.entries);
  } catch (error) {
    console.error("[FILE_TREE_BUILD_ERROR]", error);
    return [];
  }
}
