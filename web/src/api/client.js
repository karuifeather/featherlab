export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = "GET" } = {}) {
  let response;
  try {
    response = await fetch(path, { method });
  } catch {
    throw new ApiError("Could not reach the featherlab server.", { code: "NETWORK" });
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body; fall through to the generic message below.
  }
  if (!response.ok)
    throw new ApiError(data?.error || `Request failed (${response.status})`, {
      status: response.status,
      code: data?.code,
      details: data?.details,
    });
  return data;
}

const exercisePath = (id) => `/api/exercises/${encodeURIComponent(id)}`;

export const api = {
  listExercises: (query = "") => request(`/api/exercises${query}`),
  getExercise: (id) => request(exercisePath(id)),
  getHint: (id, index) => request(`${exercisePath(id)}/hints/${index}`),
  activate: (id) => request(`${exercisePath(id)}/activate`, { method: "POST" }),
  check: (id) => request(`${exercisePath(id)}/check`, { method: "POST" }),
  reset: (id) => request(`${exercisePath(id)}/reset`, { method: "POST" }),
  select: (id) => request(`${exercisePath(id)}/select`, { method: "POST" }),
  getTrackProgress: (trackId) => request(`/api/progress/track/${encodeURIComponent(trackId)}`),
  getResume: () => request("/api/resume"),
  getVersion: () => request("/api/version"),
  getStatus: () => request("/api/status"),
};
