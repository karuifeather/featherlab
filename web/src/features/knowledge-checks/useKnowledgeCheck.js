import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "../../api/client.js";

const init = { check: null, status: "loading", error: null, answers: {}, result: null, epoch: 0 };

function reducer(state, action) {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, status: "loading", error: null, answers: {}, result: null };
    case "FETCH_OK":
      return { ...state, check: action.check, status: "ready" };
    case "FETCH_ERR":
      return { ...state, status: "error", error: action.error };
    case "ANSWER":
      if (action.multi) {
        const cur = Array.isArray(state.answers[action.questionId])
          ? state.answers[action.questionId]
          : [];
        const idx = cur.indexOf(action.optionId);
        const next =
          idx >= 0 ? cur.filter((x) => x !== action.optionId) : [...cur, action.optionId];
        return { ...state, answers: { ...state.answers, [action.questionId]: next } };
      }
      return { ...state, answers: { ...state.answers, [action.questionId]: action.optionId } };
    case "SUBMITTING":
      return { ...state, status: "submitting" };
    case "SUBMIT_OK":
      return { ...state, status: "submitted", result: action.result };
    case "SUBMIT_ERR":
      return { ...state, status: "error", error: action.error };
    case "RETRY":
      return {
        ...state,
        status: "loading",
        error: null,
        answers: {},
        result: null,
        epoch: state.epoch + 1,
      };
    default:
      return state;
  }
}

export function useKnowledgeCheck(id) {
  const [state, dispatch] = useReducer(reducer, init);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "FETCH_START" });
    api
      .getKnowledgeCheck(id)
      .then((data) => {
        if (cancelled) return;
        dispatch({ type: "FETCH_OK", check: data.knowledgeCheck });
      })
      .catch((err) => {
        if (cancelled) return;
        dispatch({ type: "FETCH_ERR", error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [id, state.epoch]);

  const handleAnswer = useCallback((questionId, optionId, { multi = false } = {}) => {
    dispatch({ type: "ANSWER", questionId, optionId, multi });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!state.check || state.status !== "ready") return;
    for (const q of state.check.questions) {
      const ans = state.answers[q.id];
      if (q.type === "multiple-select") {
        if (!Array.isArray(ans) || ans.length === 0) return;
      } else {
        if (!ans) return;
      }
    }
    dispatch({ type: "SUBMITTING" });
    try {
      const data = await api.submitKnowledgeCheck(id, {
        revision: state.check.contentRevision,
        answers: state.answers,
      });
      if (!mounted.current) return;
      dispatch({ type: "SUBMIT_OK", result: data });
    } catch (err) {
      if (!mounted.current) return;
      dispatch({ type: "SUBMIT_ERR", error: err.message });
    }
  }, [state.check, state.answers, id, state.status]);

  const handleRetry = useCallback(() => {
    dispatch({ type: "RETRY" });
  }, []);

  const { check, status, error, answers, result } = state;

  const allAnswered =
    check != null &&
    check.questions.every((q) => {
      const ans = answers[q.id];
      if (q.type === "multiple-select") return Array.isArray(ans) && ans.length > 0;
      return Boolean(ans);
    });

  return {
    check,
    status,
    error,
    answers,
    result,
    allAnswered,
    handleAnswer,
    handleSubmit,
    handleRetry,
  };
}
