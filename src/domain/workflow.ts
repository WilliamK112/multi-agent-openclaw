import { z } from "zod";

export const sourceDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().optional(),
  excerpt: z.string().default(""),
  reliability: z.enum(["high", "medium", "low"]).default("medium"),
  retrievedAt: z.string().datetime().optional(),
});

export const claimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  section: z.string().default("draft"),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

export const evidenceLinkSchema = z.object({
  id: z.string().min(1),
  claimId: z.string().min(1),
  sourceId: z.string().min(1),
  rationale: z.string().default(""),
  strength: z.enum(["strong", "partial", "weak"]).default("partial"),
});

export const workflowArtifactSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  stage: z.string().min(1),
  type: z.enum(["plan", "notes", "draft", "qa", "evidence-report", "final"]),
  path: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const workflowEvidenceBundleSchema = z.object({
  runId: z.string().min(1),
  sources: z.array(sourceDocumentSchema).default([]),
  claims: z.array(claimSchema).default([]),
  links: z.array(evidenceLinkSchema).default([]),
  artifacts: z.array(workflowArtifactSchema).default([]),
});

export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
export type WorkflowArtifact = z.infer<typeof workflowArtifactSchema>;
export type WorkflowEvidenceBundle = z.infer<typeof workflowEvidenceBundleSchema>;

export function validateWorkflowEvidenceBundle(input: unknown): WorkflowEvidenceBundle {
  return workflowEvidenceBundleSchema.parse(input);
}

export function findUnsupportedClaims(bundle: WorkflowEvidenceBundle): Claim[] {
  const supportedClaimIds = new Set(bundle.links.map((l) => l.claimId));
  return bundle.claims.filter((c) => !supportedClaimIds.has(c.id));
}
