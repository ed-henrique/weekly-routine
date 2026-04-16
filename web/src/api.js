async function req(method, url, body) {
  const opts = { method, credentials: "include", headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) { const e = new Error("unauthorized"); e.status = 401; throw e; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  me:             ()               => req("GET",    "/api/me"),
  login:          (password)       => req("POST",   "/api/login",  { password }),
  logout:         ()               => req("POST",   "/api/logout"),
  getState:       ()               => req("GET",    "/api/state"),
  createRoutine:  (t)              => req("POST",   "/api/routine", t),
  updateRoutine:  (id, t)          => req("PUT",    `/api/routine/${id}`, t),
  deleteRoutine:  (id)             => req("DELETE", `/api/routine/${id}`),
  createOverride: (date, t)        => req("POST",   `/api/overrides/${date}`, t),
  updateOverride: (date, id, t)    => req("PUT",    `/api/overrides/${date}/${id}`, t),
  deleteOverride: (date, id)       => req("DELETE", `/api/overrides/${date}/${id}`),
  markDone:       (date, id)       => req("POST",   `/api/completions/${date}/${id}`),
  unmarkDone:     (date, id)       => req("DELETE", `/api/completions/${date}/${id}`),
};
