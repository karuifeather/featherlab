import "./KnowledgeCheckPanel.scss";
import { useKnowledgeCheck } from "./useKnowledgeCheck.js";

const PASS_THRESHOLD = 0.8;

export function KnowledgeCheckPanel({ id }) {
  const {
    check,
    status,
    error,
    answers,
    result,
    allAnswered,
    handleAnswer,
    handleSubmit,
    handleRetry,
  } = useKnowledgeCheck(id);

  if (status === "loading") {
    return (
      <div className="kc-panel" data-testid="knowledge-check-panel">
        <div className="kc-loading">
          <div className="kc-spinner" aria-hidden="true" />
          <span>Loading quiz…</span>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="kc-panel" data-testid="knowledge-check-panel">
        <div className="kc-error" role="alert">
          {error || "Failed to load knowledge check."}
        </div>
      </div>
    );
  }

  return (
    <div className="kc-panel" data-testid="knowledge-check-panel">
      <div className="kc-scroll">
        <div className="kc-type-label">Knowledge Check</div>
        <header className="kc-header">
          <h2>{check.title}</h2>
          <p className="kc-summary">{check.summary}</p>
          <div className="kc-meta">
            <span>{check.questionCount ?? check.questions.length} questions</span>
            <span className="kc-meta-sep" aria-hidden="true">
              ·
            </span>
            <span>~{check.estimatedMinutes} min</span>
            <span className="kc-meta-sep" aria-hidden="true">
              ·
            </span>
            <span>{check.difficulty}</span>
          </div>
        </header>

        {status === "submitted" && result ? (
          <ResultView result={result} questions={check.questions} onRetry={handleRetry} />
        ) : (
          <QuizForm
            questions={check.questions}
            answers={answers}
            submitting={status === "submitting"}
            onAnswer={handleAnswer}
          />
        )}
      </div>

      {status !== "submitted" && (
        <div className="kc-actions">
          <button
            type="button"
            className="kc-submit-btn"
            disabled={!allAnswered || status === "submitting"}
            onClick={handleSubmit}
            data-testid="kc-submit-btn"
          >
            {status === "submitting" ? "Submitting…" : "Submit answers"}
          </button>
          {!allAnswered && status === "ready" && (
            <span className="kc-unanswered-note">Answer all questions to submit</span>
          )}
        </div>
      )}

      {status === "submitted" && (
        <div className="kc-actions">
          <button
            type="button"
            className="kc-retry-btn"
            onClick={handleRetry}
            data-testid="kc-retry-btn"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function QuizForm({ questions, answers, submitting, onAnswer }) {
  return (
    <div className="kc-questions">
      {questions.map((q, i) => (
        <QuestionItem
          key={q.id}
          question={q}
          index={i}
          answer={answers[q.id]}
          disabled={submitting}
          onAnswer={onAnswer}
        />
      ))}
    </div>
  );
}

function QuestionItem({ question, index, answer, disabled, onAnswer }) {
  const isMulti = question.type === "multiple-select";
  const selectedSet = new Set(Array.isArray(answer) ? answer : answer ? [answer] : []);

  return (
    <div className="kc-question">
      <div className="kc-question-header">
        <span className="kc-question-num" aria-hidden="true">
          {index + 1}
        </span>
        <p className="kc-question-prompt">{question.prompt}</p>
      </div>
      {isMulti && <p className="kc-question-hint">Select all that apply</p>}
      <div
        className="kc-options"
        role={isMulti ? "group" : "radiogroup"}
        aria-label={question.prompt}
      >
        {question.options.map((opt) => {
          const isSelected = selectedSet.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              className={`kc-option ${isMulti ? "kc-checkbox" : ""} ${isSelected ? "selected" : ""}`}
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onAnswer(question.id, opt.id, { multi: isMulti })}
            >
              <span className="kc-option-indicator" aria-hidden="true" />
              <span className="kc-option-text">{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultView({ result, questions }) {
  const passed = result.score.percent >= PASS_THRESHOLD * 100;
  // Build a lookup map from question id → question object for prompt display
  const qMap = new Map(questions.map((q) => [q.id, q]));

  return (
    <div>
      <div className="kc-result" data-testid="kc-result">
        <div className={`kc-result-header ${passed ? "passed" : "failed"}`}>
          <span className={`kc-result-badge ${passed ? "passed" : "failed"}`}>
            {passed ? "Passed" : "Needs review"}
          </span>
          <span className="kc-result-score" data-testid="kc-score">
            {result.score.earned} / {result.score.possible} correct
            <span className="kc-result-pct">({result.score.percent}%)</span>
          </span>
        </div>

        <div className="kc-result-questions">
          {result.questions.map((qr) => (
            <ResultQuestion key={qr.id} questionResult={qr} question={qMap.get(qr.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultQuestion({ questionResult, question }) {
  const { correct, submitted, correctIds, explanation, wrongExplanations, docRef, tryCommand } =
    questionResult;
  const submittedArr = Array.isArray(submitted) ? submitted : submitted ? [submitted] : [];
  const correctSet = new Set(correctIds);

  const wrongSubmittedId = submittedArr.find((sid) => !correctSet.has(sid));
  const wrongExplanation = wrongSubmittedId && wrongExplanations?.[wrongSubmittedId];

  const prompt = question?.prompt ?? questionResult.id;

  return (
    <div className="kc-result-question">
      <div className="kc-result-q-header">
        <span
          className="kc-result-icon"
          aria-hidden="true"
          style={{ color: correct ? "var(--color-success)" : "var(--color-error)" }}
        >
          {correct ? "✓" : "✗"}
        </span>
        <p className="kc-result-prompt">{prompt}</p>
      </div>

      {explanation && <div className="kc-result-explanation">{explanation}</div>}
      {!correct && wrongExplanation && (
        <div className="kc-result-wrong-explanation">{wrongExplanation}</div>
      )}
      {docRef && (
        <a href={docRef} target="_blank" rel="noopener noreferrer" className="kc-result-doc-ref">
          Documentation ↗
        </a>
      )}
      {tryCommand && (
        <span className="kc-result-try-command">
          Try: <code>{tryCommand}</code>
        </span>
      )}
    </div>
  );
}
