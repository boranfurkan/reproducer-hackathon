// Output shapes asked from Argon, as JSON schema plus matching TypeScript types.
import type { EnvProfile } from "../types";

export const envProfileSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    engine: { type: "string", enum: ["chromium", "webkit", "firefox"] },
    locale: { type: "string", description: "BCP 47 tag such as tr-TR" },
    timezoneId: { type: "string", description: "IANA zone such as Europe/Istanbul" },
    viewport: {
      type: "object",
      properties: { width: { type: "integer" }, height: { type: "integer" } },
      required: ["width", "height"],
    },
    deviceScaleFactor: { type: "number" },
    isMobile: { type: "boolean" },
    hasTouch: { type: "boolean" },
    userAgent: { type: "string" },
    colorScheme: { type: "string", enum: ["light", "dark"] },
    storageBlocked: { type: "boolean" },
    reducedMotion: { type: "boolean" },
    notEmulated: { type: "array", items: { type: "string" } },
  },
  required: ["name", "engine", "locale", "timezoneId", "viewport", "deviceScaleFactor", "isMobile", "hasTouch", "notEmulated"],
};

/** An extra condition, not stated in the report, applied on top of the reporter's profile to see if it triggers the bug. */
export interface Stressor {
  name: string;
  why: string;
  override: {
    engine?: string;
    locale?: string;
    timezoneId?: string;
    colorScheme?: string;
    storageBlocked?: boolean;
    reducedMotion?: boolean;
  };
}

export const stressorSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    why: { type: "string" },
    override: {
      type: "object",
      properties: {
        engine: { type: "string", enum: ["chromium", "webkit", "firefox"] },
        locale: { type: "string" },
        timezoneId: { type: "string" },
        colorScheme: { type: "string", enum: ["light", "dark"] },
        storageBlocked: { type: "boolean" },
        reducedMotion: { type: "boolean" },
      },
    },
  },
  required: ["name", "why", "override"],
};

export interface Understanding {
  summary: string;
  stressors: Stressor[];
  /** What the attached recording or screenshot shows: the steps, the symptom and environment clues. Empty without media. */
  mediaObservations: string;
  expected: string;
  actual: string;
  suspectedVariables: string[];
  profile: EnvProfile;
}

export const understandingSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    expected: { type: "string" },
    actual: { type: "string" },
    suspectedVariables: { type: "array", items: { type: "string" } },
    stressors: { type: "array", items: stressorSchema },
    mediaObservations: { type: "string" },
    profile: envProfileSchema,
  },
  required: ["summary", "expected", "actual", "suspectedVariables", "stressors", "mediaObservations", "profile"],
};

export type StepAction = "goto" | "click" | "fill" | "press" | "wait" | "expect_visible" | "expect_text" | "expect_count_min";

export interface ReplayStep {
  action: StepAction;
  url?: string;
  selector?: string;
  value?: string;
  key?: string;
  ms?: number;
  text?: string;
  min?: number;
}

export interface ReplayPlan {
  steps: ReplayStep[];
  successCriterion: string;
}

export const replayPlanSchema = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["goto", "click", "fill", "press", "wait", "expect_visible", "expect_text", "expect_count_min"] },
          url: { type: "string" },
          selector: { type: "string" },
          value: { type: "string" },
          key: { type: "string" },
          ms: { type: "integer" },
          text: { type: "string" },
          min: { type: "integer" },
        },
        required: ["action"],
      },
    },
    successCriterion: { type: "string" },
  },
  required: ["steps", "successCriterion"],
};

export interface Diagnosis {
  rootCause: string;
  file: string;
  explanation: string;
  fixIdea: string;
}

export const diagnosisSchema = {
  type: "object",
  properties: {
    rootCause: { type: "string" },
    file: { type: "string" },
    explanation: { type: "string" },
    fixIdea: { type: "string" },
  },
  required: ["rootCause", "file", "explanation", "fixIdea"],
};

export interface FileChange {
  path: string;
  content: string;
}

export const fileChangesSchema = {
  type: "object",
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
    explanation: { type: "string" },
  },
  required: ["files", "explanation"],
};

export interface FileChanges {
  files: FileChange[];
  explanation: string;
}

/** Root cause, the failing test and a candidate fix, produced in one model call. */
export interface Proposal {
  rootCause: string;
  file: string;
  explanation: string;
  /** Short imperative pull request title, for example "Use locale-independent upper-casing for category keys". */
  prTitle: string;
  testContent: string;
  files: FileChange[];
  fixExplanation: string;
}

export const proposalSchema = {
  type: "object",
  properties: {
    rootCause: { type: "string" },
    file: { type: "string" },
    explanation: { type: "string" },
    prTitle: { type: "string" },
    testContent: { type: "string" },
    files: {
      type: "array",
      items: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
    fixExplanation: { type: "string" },
  },
  required: ["rootCause", "file", "explanation", "prTitle", "testContent", "files", "fixExplanation"],
};

/** A revised fix after review comments: the whole set of files that differ from the base branch, the test, and what to tell the reviewer. */
export interface Revision {
  summary: string;
  reply: string;
  testContent: string;
  files: FileChange[];
}

export const revisionSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    reply: { type: "string" },
    testContent: { type: "string" },
    files: {
      type: "array",
      items: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    },
  },
  required: ["summary", "reply", "testContent", "files"],
};
