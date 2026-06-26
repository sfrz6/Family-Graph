/**
 * AdminPanel.jsx - Admin dashboard.
 *
 * Shows:
 * - Statistics (total people, generations, pending contributions, etc.)
 * - Quick add person form
 * - Link child to parents form
 * - Link spouse form
 * - Pending contributions list with approve/reject buttons
 */

import { useState, useEffect, useMemo } from "react";
import {
  getStats,
  getPersons,
  getRelationships,
  createPerson,
  updatePerson,
  addChild,
  addSpouse,
  getContributions,
  approveContribution,
  rejectContribution,
} from "../api";
import ConfirmDialog from "./ConfirmDialog";

// Build a personId -> father map from parent_child relationships.
// Used to walk the paternal lineage for ancestry-chain names.
function buildFatherMap(persons, relationships) {
  const map = {};
  relationships
    .filter((r) => r.relationship_type === "parent_child")
    .forEach((r) => {
      const parent = persons.find((p) => p.id === r.person_id);
      if (parent && parent.gender === "male") {
        map[r.related_person_id] = parent;
      }
    });
  return map;
}

// "Sulaiman bin Mohammed bin Issa" - walks the full paternal chain so
// people who share a first name (common in Arab families) can be told
// apart in dropdowns. Only the leaf's own gender affects the first
// prefix; every ancestor above that is a father, hence always "bin".
function getChainName(person, fatherMap, isAr) {
  if (!person) return "";
  const parts = [isAr ? person.name_ar : person.name_en];
  const visited = new Set([person.id]);
  let current = person;
  let first = true;
  while (fatherMap[current.id] && !visited.has(fatherMap[current.id].id)) {
    const father = fatherMap[current.id];
    const prefix = first
      ? current.gender === "male" ? (isAr ? "بن" : "bin") : (isAr ? "بنت" : "bint")
      : (isAr ? "بن" : "bin");
    parts.push(prefix, isAr ? father.name_ar : father.name_en);
    visited.add(father.id);
    current = father;
    first = false;
  }
  return parts.join(" ");
}

function AdminPanel({ language, onDataChanged, onClose }) {
  const [stats, setStats] = useState(null);
  const [persons, setPersons] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [activeTab, setActiveTab] = useState("stats");
  const [message, setMessage] = useState("");
  const [confirmRejectId, setConfirmRejectId] = useState(null);

  // Add person form
  const [newPerson, setNewPerson] = useState({
    name_en: "",
    name_ar: "",
    gender: "male",
    generation: "",
  });

  // Edit person form
  const [editPersonId, setEditPersonId] = useState("");
  const [editPerson, setEditPerson] = useState({ name_en: "", name_ar: "", gender: "male", generation: "" });

  // Link child form
  const [childLink, setChildLink] = useState({
    child_id: "",
    father_id: "",
    mother_id: "",
  });

  // Link spouse form
  const [spouseLink, setSpouseLink] = useState({
    person_id: "",
    spouse_id: "",
  });

  const isAr = language === "ar";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [s, p, r, c] = await Promise.all([
        getStats(),
        getPersons(),
        getRelationships(),
        getContributions(),
      ]);
      setStats(s);
      setPersons(p);
      setRelationships(r);
      setContributions(c);
    } catch (err) {
      console.error(err);
    }
  };

  const fatherOf = useMemo(() => buildFatherMap(persons, relationships), [persons, relationships]);

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  const handleAddPerson = async () => {
    if (!newPerson.name_ar) {
      showMessage(isAr ? "يرجى إدخال الاسم بالعربي" : "Arabic name is required");
      return;
    }
    try {
      await createPerson({
        ...newPerson,
        generation: newPerson.generation !== "" ? Number(newPerson.generation) : null,
      });
      setNewPerson({ name_en: "", name_ar: "", gender: "male", generation: "" });
      showMessage(isAr ? "تمت الإضافة بنجاح ✓" : "Person added ✓");
      loadData();
      onDataChanged();
    } catch (err) {
      showMessage(isAr ? "حدث خطأ" : "Error occurred");
    }
  };

  const handleEditPersonSelect = (id) => {
    setEditPersonId(id);
    if (!id) { setEditPerson({ name_en: "", name_ar: "", gender: "male", generation: "" }); return; }
    const p = persons.find((x) => x.id === Number(id));
    if (p) setEditPerson({ name_en: p.name_en || "", name_ar: p.name_ar || "", gender: p.gender, generation: p.generation ?? "" });
  };

  const handleUpdatePerson = async () => {
    if (!editPersonId) { showMessage(isAr ? "يرجى اختيار شخص" : "Please select a person"); return; }
    if (!editPerson.name_ar) { showMessage(isAr ? "يرجى إدخال الاسم بالعربي" : "Arabic name is required"); return; }
    try {
      await updatePerson(Number(editPersonId), {
        name_en: editPerson.name_en || "",
        name_ar: editPerson.name_ar,
        gender: editPerson.gender,
        generation: editPerson.generation !== "" ? Number(editPerson.generation) : null,
      });
      showMessage(isAr ? "تم التحديث بنجاح ✓" : "Updated ✓");
      loadData();
      onDataChanged();
    } catch {
      showMessage(isAr ? "حدث خطأ" : "Error occurred");
    }
  };

  const handleLinkChild = async () => {
    if (!childLink.child_id) {
      showMessage(isAr ? "يرجى اختيار الابن/البنت" : "Please select child");
      return;
    }
    try {
      await addChild({
        child_id: Number(childLink.child_id),
        father_id: childLink.father_id ? Number(childLink.father_id) : null,
        mother_id: childLink.mother_id ? Number(childLink.mother_id) : null,
      });
      setChildLink({ child_id: "", father_id: "", mother_id: "" });
      showMessage(isAr ? "تم الربط بنجاح ✓" : "Linked successfully ✓");
      loadData();
      onDataChanged();
    } catch (err) {
      showMessage(err.response?.data?.detail || "Error");
    }
  };

  const handleAddSpouse = async () => {
    if (!spouseLink.person_id || !spouseLink.spouse_id) {
      showMessage(isAr ? "يرجى اختيار الزوج والزوجة" : "Please select both spouses");
      return;
    }
    try {
      await addSpouse({
        person_id: Number(spouseLink.person_id),
        spouse_id: Number(spouseLink.spouse_id),
      });
      setSpouseLink({ person_id: "", spouse_id: "" });
      showMessage(isAr ? "تم الربط بنجاح ✓" : "Linked successfully ✓");
      loadData();
      onDataChanged();
    } catch (err) {
      showMessage(err.response?.data?.detail || "Error");
    }
  };

  const handleApprove = async (id) => {
    try {
      await approveContribution(id);
      showMessage(isAr ? "تمت الموافقة ✓" : "Approved ✓");
      loadData();
      onDataChanged();
    } catch (err) {
      showMessage(err.response?.data?.detail || "Error");
    }
  };

  const handleReject = async (id) => {
    setConfirmRejectId(null);
    try {
      await rejectContribution(id);
      showMessage(isAr ? "تم الرفض" : "Rejected");
      loadData();
    } catch (err) {
      showMessage("Error");
    }
  };

  const getChain = (p) => getChainName(p, fatherOf, isAr);
  const males = persons.filter((p) => p.gender === "male");
  const females = persons.filter((p) => p.gender === "female");

  const tabs = isAr
    ? { stats: "إحصائيات", add: "إضافة شخص", edit: "تعديل شخص", link: "ربط الأبناء", spouse: "ربط الزوج/الزوجة", contributions: "الطلبات" }
    : { stats: "Statistics", add: "Add Person", edit: "Edit Person", link: "Link Child", spouse: "Link Spouse", contributions: "Requests" };

  const relationLabels = isAr
    ? { father: "أب", mother: "أم", spouse: "زوج/زوجة", child: "ابن/بنت", sibling: "أخ/أخت" }
    : { father: "Father", mother: "Mother", spouse: "Spouse", child: "Child", sibling: "Sibling" };

  const pendingCount = contributions.filter((c) => c.status === "pending").length;

  return (
    <div className="admin-overlay">
      {confirmRejectId !== null && (
        <ConfirmDialog
          language={language}
          message={isAr ? "هل أنت متأكد من رفض هذا الطلب؟" : "Are you sure you want to reject this request?"}
          confirmLabel={isAr ? "رفض" : "Reject"}
          cancelLabel={isAr ? "إلغاء" : "Cancel"}
          onConfirm={() => handleReject(confirmRejectId)}
          onCancel={() => setConfirmRejectId(null)}
        />
      )}
      <div className={`admin-panel ${isAr ? "rtl" : "ltr"}`}>
        <div className="admin-header">
          <h2>{isAr ? "لوحة الإدارة" : "Admin Dashboard"}</h2>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        {message && <div className="admin-message">{message}</div>}

        <div className="admin-tabs">
          {Object.entries(tabs).map(([key, label]) => (
            <button
              key={key}
              className={`admin-tab ${activeTab === key ? "active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
              {key === "contributions" && pendingCount > 0 && (
                <span className="tab-badge">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="admin-content">
          {/* STATISTICS TAB */}
          {activeTab === "stats" && stats && (
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-number">{stats.total_persons}</span>
                <span className="stat-label">{isAr ? "إجمالي الأفراد" : "Total Members"}</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{stats.total_males}</span>
                <span className="stat-label">{isAr ? "ذكور" : "Males"}</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{stats.total_females}</span>
                <span className="stat-label">{isAr ? "إناث" : "Females"}</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{stats.total_generations}</span>
                <span className="stat-label">{isAr ? "الأجيال" : "Generations"}</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{stats.total_relationships}</span>
                <span className="stat-label">{isAr ? "الروابط" : "Relationships"}</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{stats.pending_contributions}</span>
                <span className="stat-label">{isAr ? "طلبات معلقة" : "Pending Requests"}</span>
              </div>
            </div>
          )}

          {/* ADD PERSON TAB */}
          {activeTab === "add" && (
            <div className="admin-form">
              <div className="form-group">
                <label>{isAr ? "الاسم بالعربي" : "Arabic Name"}</label>
                <input
                  type="text"
                  value={newPerson.name_ar}
                  onChange={(e) => setNewPerson({ ...newPerson, name_ar: e.target.value })}
                  placeholder={isAr ? "أدخل الاسم بالعربي" : "Enter Arabic name"}
                  className="form-input"
                  dir="rtl"
                />
              </div>
              <div className="form-group">
                <label>{isAr ? "الاسم بالإنجليزي" : "English Name"}</label>
                <input
                  type="text"
                  value={newPerson.name_en}
                  onChange={(e) => setNewPerson({ ...newPerson, name_en: e.target.value })}
                  placeholder={isAr ? "أدخل الاسم بالإنجليزي" : "Enter English name"}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>{isAr ? "الجنس" : "Gender"}</label>
                <select
                  value={newPerson.gender}
                  onChange={(e) => setNewPerson({ ...newPerson, gender: e.target.value })}
                  className="form-input"
                >
                  <option value="male">{isAr ? "ذكر" : "Male"}</option>
                  <option value="female">{isAr ? "أنثى" : "Female"}</option>
                </select>
              </div>
              <div className="form-group">
                <label>{isAr ? "الجيل (رقم الصف في الشجرة)" : "Generation (row in tree)"}</label>
                <input
                  type="number"
                  min="1"
                  value={newPerson.generation}
                  onChange={(e) => setNewPerson({ ...newPerson, generation: e.target.value })}
                  placeholder={isAr ? "مثال: 1 = أقدم جد، 2 = أب، 3 = ابن..." : "e.g. 1 = oldest ancestor, 2 = parent, 3 = child..."}
                  className="form-input"
                />
              </div>
              <button className="form-submit" onClick={handleAddPerson}>
                {isAr ? "إضافة" : "Add Person"}
              </button>
            </div>
          )}

          {/* EDIT PERSON TAB */}
          {activeTab === "edit" && (
            <div className="admin-form">
              <div className="form-group">
                <label>{isAr ? "اختر شخصاً للتعديل" : "Select person to edit"}</label>
                <select
                  value={editPersonId}
                  onChange={(e) => handleEditPersonSelect(e.target.value)}
                  className="form-input"
                >
                  <option value="">{isAr ? "اختر..." : "Select..."}</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>{getChain(p)}</option>
                  ))}
                </select>
              </div>
              {editPersonId && (
                <>
                  <div className="form-group">
                    <label>{isAr ? "الاسم بالعربي" : "Arabic Name"}</label>
                    <input
                      type="text"
                      value={editPerson.name_ar}
                      onChange={(e) => setEditPerson({ ...editPerson, name_ar: e.target.value })}
                      className="form-input"
                      dir="rtl"
                    />
                  </div>
                  <div className="form-group">
                    <label>{isAr ? "الاسم بالإنجليزي (اختياري)" : "English Name (optional)"}</label>
                    <input
                      type="text"
                      value={editPerson.name_en}
                      onChange={(e) => setEditPerson({ ...editPerson, name_en: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>{isAr ? "الجنس" : "Gender"}</label>
                    <select
                      value={editPerson.gender}
                      onChange={(e) => setEditPerson({ ...editPerson, gender: e.target.value })}
                      className="form-input"
                    >
                      <option value="male">{isAr ? "ذكر" : "Male"}</option>
                      <option value="female">{isAr ? "أنثى" : "Female"}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{isAr ? "الجيل (رقم الصف في الشجرة)" : "Generation (row in tree)"}</label>
                    <input
                      type="number"
                      min="1"
                      value={editPerson.generation}
                      onChange={(e) => setEditPerson({ ...editPerson, generation: e.target.value })}
                      placeholder={isAr ? "مثال: 1 = أقدم جد..." : "e.g. 1 = oldest ancestor..."}
                      className="form-input"
                    />
                  </div>
                  <button className="form-submit" onClick={handleUpdatePerson}>
                    {isAr ? "حفظ التعديلات" : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* LINK CHILD TAB */}
          {activeTab === "link" && (
            <div className="admin-form">
              <div className="form-group">
                <label>{isAr ? "الابن/البنت" : "Child"}</label>
                <select
                  value={childLink.child_id}
                  onChange={(e) => setChildLink({ ...childLink, child_id: e.target.value })}
                  className="form-input"
                >
                  <option value="">{isAr ? "اختر..." : "Select..."}</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>{getChain(p)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{isAr ? "الأب" : "Father"}</label>
                <select
                  value={childLink.father_id}
                  onChange={(e) => setChildLink({ ...childLink, father_id: e.target.value })}
                  className="form-input"
                >
                  <option value="">{isAr ? "اختر..." : "Select..."}</option>
                  {males.map((p) => (
                    <option key={p.id} value={p.id}>{getChain(p)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{isAr ? "الأم" : "Mother"}</label>
                <select
                  value={childLink.mother_id}
                  onChange={(e) => setChildLink({ ...childLink, mother_id: e.target.value })}
                  className="form-input"
                >
                  <option value="">{isAr ? "اختر..." : "Select..."}</option>
                  {females.map((p) => (
                    <option key={p.id} value={p.id}>{getChain(p)}</option>
                  ))}
                </select>
              </div>
              <button className="form-submit" onClick={handleLinkChild}>
                {isAr ? "ربط" : "Link Child"}
              </button>
            </div>
          )}

          {/* LINK SPOUSE TAB */}
          {activeTab === "spouse" && (
            <div className="admin-form">
              <div className="form-group">
                <label>{isAr ? "الشخص الأول" : "Person"}</label>
                <select
                  value={spouseLink.person_id}
                  onChange={(e) => setSpouseLink({ ...spouseLink, person_id: e.target.value })}
                  className="form-input"
                >
                  <option value="">{isAr ? "اختر..." : "Select..."}</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>{getChain(p)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{isAr ? "الزوج/الزوجة" : "Spouse"}</label>
                <select
                  value={spouseLink.spouse_id}
                  onChange={(e) => setSpouseLink({ ...spouseLink, spouse_id: e.target.value })}
                  className="form-input"
                >
                  <option value="">{isAr ? "اختر..." : "Select..."}</option>
                  {persons
                    .filter((p) => String(p.id) !== spouseLink.person_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{getChain(p)}</option>
                    ))}
                </select>
              </div>
              <button className="form-submit" onClick={handleAddSpouse}>
                {isAr ? "ربط" : "Link Spouse"}
              </button>
            </div>
          )}

          {/* CONTRIBUTIONS TAB */}
          {activeTab === "contributions" && (
            <div className="contributions-list">
              {contributions.length === 0 ? (
                <p className="no-data">{isAr ? "لا توجد طلبات" : "No contributions"}</p>
              ) : (
                contributions.map((c) => {
                  let data = {};
                  try { data = JSON.parse(c.data); } catch {}

                  const isRelative = c.contribution_type === "add_relative";
                  const isDeceased = c.contribution_type === "mark_deceased";
                  const requestedName = isAr
                    ? data.name_ar || data.name_en || ""
                    : data.name_en || data.name_ar || "";
                  const originalPerson = (isRelative || isDeceased) && data.person_id
                    ? persons.find((p) => p.id === data.person_id)
                    : null;
                  const originalName = originalPerson
                    ? getChain(originalPerson)
                    : data.person_name || (isAr ? "غير معروف" : "Unknown");
                  const relationLabel = isRelative
                    ? relationLabels[data.relative_type] || data.relative_type
                    : "";

                  return (
                    <div key={c.id} className={`contribution-item ${c.status}`}>
                      <div className="contribution-info">
                        <span className="contribution-type">
                          {isDeceased
                            ? (isAr ? "إبلاغ عن وفاة" : "Report Deceased")
                            : isRelative
                            ? (isAr ? "إضافة قريب" : "Add Relative")
                            : (isAr ? "إضافة شخص" : "Add Person")}
                        </span>
                        {isDeceased ? (
                          <span className="contribution-detail">{originalName}</span>
                        ) : isRelative ? (
                          <span className="contribution-detail">
                            {originalName} → {requestedName}
                            {relationLabel && (
                              <span className="contribution-relation"> ({relationLabel})</span>
                            )}
                          </span>
                        ) : (
                          <span className="contribution-detail">{requestedName}</span>
                        )}
                        <span className={`contribution-status ${c.status}`}>
                          {c.status === "pending"
                            ? (isAr ? "معلق" : "Pending")
                            : c.status === "approved"
                            ? (isAr ? "مقبول" : "Approved")
                            : (isAr ? "مرفوض" : "Rejected")}
                        </span>
                      </div>
                      {c.status === "pending" && (
                        <div className="contribution-actions">
                          <button
                            className="approve-btn"
                            onClick={() => handleApprove(c.id)}
                          >
                            {isAr ? "قبول" : "Approve"}
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() => setConfirmRejectId(c.id)}
                          >
                            {isAr ? "رفض" : "Reject"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
