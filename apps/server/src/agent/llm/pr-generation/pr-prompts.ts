export class PRPrompts {
  /**
   * Build the prompt for PR metadata generation
   */
  buildPRGenerationPrompt(options: {
    taskTitle: string;
    gitDiff: string;
    commitMessages: string[];
    wasTaskCompleted: boolean;
  }): string {
    const sections = [
      "Generate a pull request title and description based on the following information:",
      "",
      `**Task Title:** ${options.taskTitle}`,
      `**Task Status:** ${options.wasTaskCompleted ? "Completed successfully" : "Partially completed or stopped early"}`,
      "",
    ];

    if (options.commitMessages.length > 0) {
      sections.push(
        "**Recent Commits:**",
        ...options.commitMessages.map((msg) => `- ${msg}`),
        ""
      );
    }

    if (options.gitDiff.trim()) {
      sections.push(
        "**Git Diff:**",
        "```diff",
        options.gitDiff.slice(0, 3000), // Limit diff size for token efficiency
        "```",
        ""
      );
    }

    sections.push(
      "Guidelines:",
      "- Title should be concise and action-oriented (max 50 chars) (e.g., 'Add user authentication', 'Fix API error handling')",
      "- Description should use bullet points and be informative but concise",
      "- Be as detailed as the code changes are. If many changes were made, be detailed in the description.",
      "- Write in markdown format and include headers or bolded text to make it more readable.",
      "- Write about any tests that were run or need to be run. Ensure that you explain how a reviewer should test these changes",
      "- Organize in the following sections: Changes, Tests, Documentation, and Follow-up Recommendations",
      "- Focus on what was implemented, not implementation details"
    );

    return sections.join("\n");
  }
}
