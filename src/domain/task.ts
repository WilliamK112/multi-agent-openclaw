/**
 * Task classification for Knox-style orchestration.
 * Maps user goals to task type and complexity for dynamic model selection.
 */

export type TaskType = "programming" | "research_writing" | "general";

export type Complexity = "simple" | "medium" | "complex";

export type TaskClassification = {
  type: TaskType;
  complexity: Complexity;
  reason?: string;
};

/**
 * Classify goal into task type (programming vs research_writing vs general).
 */
export function classifyTaskType(goal: string): TaskType {
  const g = goal.toLowerCase();
  if (
    /(research|report|article|essay|policy|analysis|paper|workflow|论文|研究报告)/.test(g)
  ) {
    return "research_writing";
  }
  if (
    /(bug|fix|feature|refactor|code|implement|endpoint|api|function|class|test)/.test(g)
  ) {
    return "programming";
  }
  if (/(ui|click|browser|automation|cursor)/.test(g)) {
    return "programming";
  }
  if (/(data|csv|table|batch|etl|dataset)/.test(g)) {
    return "programming";
  }
  return "general";
}

/**
 * Heuristic complexity from goal length, structure, and keywords.
 */
export function classifyComplexity(goal: string, taskType: TaskType): Complexity {
  const g = goal.toLowerCase();
  const wordCount = goal.split(/\s+/).filter(Boolean).length;

  // Long, structured goals tend to be complex
  if (wordCount > 80 || /step\s*\d|first|then|finally|phase\s*\d/i.test(g)) {
    return "complex";
  }

  // Task-type-specific signals
  if (taskType === "programming") {
    if (/refactor|migrate|architecture|multi-file|integration/i.test(g)) {
      return "complex";
    }
    if (/add|fix|implement|create|write/i.test(g) && wordCount < 30) {
      return "simple";
    }
    return "medium";
  }

  if (taskType === "research_writing") {
    if (
      /1500|2000|3000|word|sources?|citation|evidence|counterargument/i.test(g)
    ) {
      return "complex";
    }
    if (/brief|summary|outline|bullet/i.test(g) && wordCount < 40) {
      return "simple";
    }
    return "medium";
  }

  if (wordCount > 50) return "medium";
  return "simple";
}

/**
 * Full task classification for Knox orchestration.
 */
export function classifyTask(goal: string): TaskClassification {
  const type = classifyTaskType(goal);
  const complexity = classifyComplexity(goal, type);
  return { type, complexity };
}
