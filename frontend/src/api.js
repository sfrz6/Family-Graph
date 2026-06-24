/**
 * api.js - Backend API communication layer.
 * 
 * This file contains every function that talks to the backend.
 * Instead of scattering fetch/axios calls across components,
 * we put them all here. Benefits:
 * 
 * 1. If the API URL changes, update ONE place
 * 2. Every component just calls api.getPersons() instead of
 *    knowing the URL, method, headers, etc.
 * 3. Error handling can be centralized
 * 
 * axios.create() makes an instance with a base URL pre-configured,
 * so we just write "/persons" instead of "/api/persons"
 *
 * baseURL is a relative path ("/api") rather than an absolute URL: in
 * production the frontend and backend are served from the same Vercel
 * domain, and in local dev the Vite dev server proxies "/api" to the
 * backend (see vite.config.js) - so this works unchanged in both places.
 *
 * withCredentials is required so the browser sends/receives the HttpOnly
 * session cookie set by the backend. There is no token to manage here -
 * the cookie is invisible to JS by design.
 */

import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// ---- Auth ----

export const login = async (secretCode) => {
  // POST /api/auth/login with the secret code
  // Sets an HttpOnly session cookie and returns { role: "admin" } or { role: "user" }
  const response = await api.post("/auth/login", { secret_code: secretCode });
  return response.data;
};

export const logout = async () => {
  // POST /api/auth/logout - clears the session cookie
  const response = await api.post("/auth/logout");
  return response.data;
};

export const getMe = async () => {
  // GET /api/auth/me - returns { role } if the session cookie is still valid
  const response = await api.get("/auth/me");
  return response.data;
};

// ---- Persons ----

export const getPersons = async () => {
  // GET /api/persons → returns array of all people
  const response = await api.get("/persons");
  return response.data;
};

export const getPerson = async (id) => {
  // GET /api/persons/5 → returns one person
  const response = await api.get(`/persons/${id}`);
  return response.data;
};

export const createPerson = async (personData) => {
  // POST /api/persons with { name_en, name_ar, gender }
  // Used for adding people WITHOUT parents (oldest generation)
  const response = await api.post("/persons", personData);
  return response.data;
};

export const addChild = async (childData) => {
  // POST /api/persons/add-child
  // { child_id, father_id, mother_id }
  // Links an existing child to their parents + auto-creates spouse link
  const response = await api.post("/persons/add-child", childData);
  return response.data;
};

export const addSpouse = async (spouseData) => {
  // POST /api/persons/add-spouse
  // { person_id, spouse_id }
  const response = await api.post("/persons/add-spouse", spouseData);
  return response.data;
};

export const updatePerson = async (id, personData) => {
  // PUT /api/persons/5 with fields to update
  const response = await api.put(`/persons/${id}`, personData);
  return response.data;
};

export const deletePerson = async (id) => {
  // DELETE /api/persons/5
  const response = await api.delete(`/persons/${id}`);
  return response.data;
};

// ---- Relationships ----

export const getRelationships = async () => {
  // GET /api/relationships → returns array of all relationships
  const response = await api.get("/relationships");
  return response.data;
};

export const createRelationship = async (relationshipData) => {
  // POST /api/relationships with { person_id, related_person_id, relationship_type }
  const response = await api.post("/relationships", relationshipData);
  return response.data;
};

export const deleteRelationship = async (id) => {
  // DELETE /api/relationships/5
  const response = await api.delete(`/relationships/${id}`);
  return response.data;
};

// ---- Relationship Finder ----

export const findRelationship = async (personId1, personId2) => {
  const response = await api.post("/relationship/find", {
    person_id_1: personId1,
    person_id_2: personId2,
  });
  return response.data;
};

// ---- Contributions ----

export const submitContribution = async (contributionData) => {
  const response = await api.post("/contributions", contributionData);
  return response.data;
};

export const getContributions = async (status = null) => {
  const params = status ? `?status=${status}` : "";
  const response = await api.get(`/contributions${params}`);
  return response.data;
};

export const approveContribution = async (id) => {
  const response = await api.put(`/contributions/${id}/approve`);
  return response.data;
};

export const rejectContribution = async (id) => {
  const response = await api.put(`/contributions/${id}/reject`);
  return response.data;
};

// ---- Admin ----

export const getStats = async () => {
  const response = await api.get("/admin/stats");
  return response.data;
};

export const getMissingRelatives = async (personId) => {
  const response = await api.get(`/persons/${personId}/missing-relatives`);
  return response.data;
};
