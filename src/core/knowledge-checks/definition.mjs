import { check } from "../schema.mjs";

export const KNOWLEDGE_CHECK_SCHEMA_VERSION = 1;
export const QUESTION_TYPES = Object.freeze(["single-choice", "multiple-select"]);
export const DIFFICULTIES = Object.freeze(["beginner", "intermediate", "advanced"]);

export const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const OPTION_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_PATTERN = /^https?:\/\/.+/;

const OPTION_SPEC = {
  type: "object",
  properties: {
    id: {
      type: "string",
      required: true,
      maxLength: 40,
      pattern: OPTION_ID_PATTERN,
      patternHint: "option id must be a lowercase slug like 'a', 'b', 'opt-1'",
    },
    text: { type: "string", required: true, minLength: 1, maxLength: 400 },
  },
};

const QUESTION_SPEC = {
  type: "object",
  properties: {
    id: {
      type: "string",
      required: true,
      maxLength: 63,
      pattern: ID_PATTERN,
      patternHint: "question id must be a lowercase slug like 'q1' or 'q-basics'",
    },
    type: { type: "string", required: true, enum: [...QUESTION_TYPES] },
    prompt: { type: "string", required: true, minLength: 1, maxLength: 1000 },
    options: { type: "array", required: true, minItems: 2, items: OPTION_SPEC },
    correctAnswer: { type: "string", maxLength: 40 },
    correctAnswers: { type: "array", minItems: 2, items: { type: "string", maxLength: 40 } },
    explanation: { type: "string", required: true, minLength: 1, maxLength: 2000 },
    wrongExplanations: { type: "object", open: true, values: { type: "string", maxLength: 1000 } },
    docRef: {
      type: "string",
      maxLength: 500,
      pattern: URL_PATTERN,
      patternHint: "must be an http/https URL",
    },
    tryCommand: { type: "string", maxLength: 500 },
  },
  open: true,
};

const KNOWLEDGE_CHECK_SPEC = {
  type: "object",
  required: true,
  properties: {
    schemaVersion: { type: "integer", required: true, enum: [KNOWLEDGE_CHECK_SCHEMA_VERSION] },
    id: { type: "string", required: true, maxLength: 63, pattern: ID_PATTERN },
    activityType: { type: "string", required: true, enum: ["knowledge-check"] },
    title: { type: "string", required: true, minLength: 1, maxLength: 120 },
    summary: { type: "string", required: true, minLength: 1, maxLength: 300 },
    track: { type: "string", required: true, pattern: TAG_PATTERN },
    level: { type: "integer", required: true, min: 0, max: 99 },
    order: { type: "number", required: true, min: 0.5, max: 999 },
    difficulty: { type: "string", required: true, enum: [...DIFFICULTIES] },
    estimatedMinutes: { type: "integer", required: true, min: 1, max: 60 },
    tags: { type: "array", items: { type: "string", pattern: TAG_PATTERN, maxLength: 40 } },
    relatedLabs: { type: "array", items: { type: "string", pattern: ID_PATTERN, maxLength: 63 } },
    contentRevision: { type: "string", required: true, minLength: 1, maxLength: 40 },
    questions: { type: "array", required: true, minItems: 1, items: QUESTION_SPEC },
  },
};

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validateQuestion(q, i, problems) {
  const path = `questions[${i}]`;
  if (!q || typeof q !== "object") return null;

  const optionIds = new Set();
  const options = Array.isArray(q.options) ? q.options : [];
  const seenOptionIds = new Set();
  for (const [j, opt] of options.entries()) {
    if (opt && typeof opt.id === "string") {
      if (seenOptionIds.has(opt.id)) {
        problems.add(`${path}.options[${j}].id`, `duplicate option id "${opt.id}"`);
      } else {
        seenOptionIds.add(opt.id);
        optionIds.add(opt.id);
      }
    }
  }

  if (q.type === "single-choice") {
    if (q.correctAnswers !== undefined && q.correctAnswers !== null) {
      problems.add(
        `${path}.correctAnswers`,
        "must not be present for single-choice questions; use correctAnswer instead",
      );
    }
    if (typeof q.correctAnswer !== "string") {
      problems.add(`${path}.correctAnswer`, "is required for single-choice questions");
      return null;
    }
    if (!optionIds.has(q.correctAnswer)) {
      problems.add(`${path}.correctAnswer`, `references unknown option id "${q.correctAnswer}"`);
      return null;
    }
    return { type: "single-choice", correctIds: [q.correctAnswer] };
  }

  if (q.type === "multiple-select") {
    if (q.correctAnswer !== undefined && q.correctAnswer !== null) {
      problems.add(
        `${path}.correctAnswer`,
        "must not be present for multiple-select questions; use correctAnswers instead",
      );
    }
    if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length < 2) {
      problems.add(
        `${path}.correctAnswers`,
        "is required for multiple-select and must have at least 2 items",
      );
      return null;
    }
    const seen = new Set();
    const correctIds = [];
    for (const [k, aid] of q.correctAnswers.entries()) {
      if (typeof aid !== "string") {
        problems.add(`${path}.correctAnswers[${k}]`, "must be a string");
        return null;
      }
      if (seen.has(aid)) {
        problems.add(`${path}.correctAnswers[${k}]`, `duplicate answer id "${aid}"`);
      } else {
        seen.add(aid);
      }
      if (!optionIds.has(aid)) {
        problems.add(`${path}.correctAnswers[${k}]`, `references unknown option id "${aid}"`);
        return null;
      }
      correctIds.push(aid);
    }
    return { type: "multiple-select", correctIds };
  }

  return null;
}

/** Dummy problems adapter for ad-hoc path-prefixed adds. */
class ProblemsSurface {
  constructor(file) {
    this.file = file;
    this.list = [];
  }
  add(path, message) {
    this.list.push({ file: this.file, path, message });
  }
}

/**
 * Validate one raw knowledge-check document and return the normalized, frozen check.
 *
 * Returns `undefined` when defects were recorded on `problems`.
 *
 * The returned object's `_answers` map is server-only and must be stripped by
 * the presenter before sending to a client.
 */
export function defineKnowledgeCheck({ data, problems, source }) {
  const before = problems.list.length;
  check(data, KNOWLEDGE_CHECK_SPEC, "", problems);
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;

  const structural = problems.list.length === before;
  if (!structural) return undefined;

  const questionIds = new Set();
  const _answers = {};
  const cleanQuestions = [];

  const questions = Array.isArray(data.questions) ? data.questions : [];
  for (const [i, q] of questions.entries()) {
    if (!q || typeof q !== "object") continue;

    if (typeof q.id === "string") {
      if (questionIds.has(q.id)) {
        problems.add(`questions[${i}].id`, `duplicate question id "${q.id}"`);
      } else {
        questionIds.add(q.id);
      }
    }

    const surface = new ProblemsSurface(source ?? "");
    const answerEntry = validateQuestion(q, i, surface);
    for (const p of surface.list) problems.add(p.path, p.message);

    if (answerEntry && typeof q.id === "string") {
      _answers[q.id] = answerEntry;
    }

    cleanQuestions.push({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: Array.isArray(q.options) ? q.options.map((o) => ({ id: o.id, text: o.text })) : [],
      explanation: q.explanation,
      ...(q.wrongExplanations ? { wrongExplanations: { ...q.wrongExplanations } } : {}),
      ...(q.docRef ? { docRef: q.docRef } : {}),
      ...(q.tryCommand ? { tryCommand: q.tryCommand } : {}),
    });
  }

  if (problems.list.length > before) return undefined;

  return deepFreeze({
    schemaVersion: data.schemaVersion,
    id: data.id,
    activityType: "knowledge-check",
    title: data.title,
    summary: data.summary,
    track: data.track,
    level: data.level,
    order: data.order,
    difficulty: data.difficulty,
    estimatedMinutes: data.estimatedMinutes,
    tags: [...(data.tags ?? [])],
    relatedLabs: [...(data.relatedLabs ?? [])],
    contentRevision: data.contentRevision,
    questions: cleanQuestions,
    _answers,
    source,
  });
}
