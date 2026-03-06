import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const auth = {
  register: (data) => api.post("/auth/register", data),
  login:    (data) => api.post("/auth/login", data, { headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
  me:       ()     => api.get("/auth/me"),
};

export const dashboard = {
  kpis:         (days = 7)   => api.get(`/dashboard/kpis?days=${days}`),
  scoreTrend:   (days = 30)  => api.get(`/dashboard/score-trend?days=${days}`),
  leaderboard:  (limit = 10) => api.get(`/dashboard/agent-leaderboard?limit=${limit}`),
  distribution: ()            => api.get("/dashboard/score-distribution"),
  activityFeed: (limit = 20) => api.get(`/dashboard/activity-feed?limit=${limit}`),
};

export const agents = {
  list:              (params)       => api.get("/agents/", { params }),
  me:                ()             => api.get("/agents/me"),
  detail:            (id)           => api.get(`/agents/${id}`),
  violations:        (id)           => api.get(`/agents/${id}/violations`),
  resetPassword:     (id, pwd)      => api.post(`/agents/${id}/reset-password`, null, { params: { new_password: pwd } }),
  delete:            (id)           => api.delete(`/agents/${id}`),
  contactSupervisor: (subject, body) => api.post("/agents/contact-supervisor", null, { params: { subject, body } }),
  supervisorMessages: ()            => api.get("/agents/supervisor-messages"),
  markMessageRead:   (id)           => api.patch(`/agents/supervisor-messages/${id}/read`),
};

export const authExtra = {
  changePassword: (oldPwd, newPwd) => api.post("/auth/change-password", null, { params: { old_password: oldPwd, new_password: newPwd } }),
};

export const transcripts = {
  ingest:           (data)           => api.post("/transcripts/ingest", data),
  upload:           (formData)       => api.post("/transcripts/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  attachAudio:      (callId, blob)   => {
    const fd = new FormData();
    // Derive a correct file extension from the blob's MIME type so the backend
    // can serve it back with the right Content-Type via StaticFiles.
    const ext = blob.type.includes("ogg") ? ".ogg" : ".webm";
    fd.append("file", blob, `recording${ext}`);
    return api.post(`/transcripts/${callId}/audio`, fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
  list:             (params)         => api.get("/transcripts/", { params }),
  get:              (id)             => api.get(`/transcripts/${id}`),
  resolveViolation: (id)             => api.patch(`/transcripts/violations/${id}/resolve`),
};

export const compliance = {
  overview:  (days = 30) => api.get(`/compliance/overview?days=${days}`),
  breakdown: (days = 30) => api.get(`/compliance/violation-breakdown?days=${days}`),
  alerts:    (status)    => api.get("/compliance/alerts", { params: { status } }),
};

export const reports = {
  generate:  (data)   => api.post("/reports/generate", data),
  list:      ()       => api.get("/reports/"),
  download:  (id)     => api.get(`/reports/${id}/download`, { responseType: "blob" }),
  myReports: (params) => api.get("/reports/my-reports", { params }),
};

export const live = {
  activeCalls: ()     => api.get("/live/active-calls"),
  whisper:     (data) => api.post("/live/whisper", data),
};

export const simulation = {
  start: (channel = "phone") => api.post("/simulation/start", null, { params: { channel } }),
  turn:  (body)              => api.post("/simulation/turn", body),
};

export default api;