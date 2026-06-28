/**
 * PersonPanel.jsx - Side panel showing person details + add relative request.
 * 
 * Shows:
 * - Person name (both languages)
 * - Parents, spouse, children, siblings
 * - "Add Relative" section for normal users
 *   - Only shows buttons for MISSING relatives (if no mother, show "Add Mother")
 *   - Submitting creates a pending contribution for admin approval
 */

import { useState, useEffect } from "react";
import { getMissingRelatives, submitContribution, deletePerson } from "../api";
import ConfirmDialog from "./ConfirmDialog";

function PersonPanel({
  person,
  persons,
  relationships,
  onClose,
  onPersonClick,
  onPersonDeleted,
  language,
  role,
}) {
  const [missing, setMissing] = useState([]);
  const [showAddForm, setShowAddForm] = useState(null); // which type: "father", "mother", etc.
  const [newRelative, setNewRelative] = useState({ name_en: "", name_ar: "", gender: "male" });
  const [message, setMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deceasedSubmitted, setDeceasedSubmitted] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);

  const isAr = language === "ar";

  useEffect(() => {
    if (person) {
      loadMissing();
      setShowAddForm(null);
      setMessage("");
      setDeceasedSubmitted(false);
      setDeleteRequested(false);
    }
  }, [person?.id]);

  const loadMissing = async () => {
    try {
      const data = await getMissingRelatives(person.id);
      setMissing(data.missing);
    } catch {}
  };

  if (!person) return null;

  const getPersonById = (id) => persons.find((p) => p.id === id);
  const getName = (p) => {
    if (!p) return isAr ? "غير معروف" : "Unknown";
    return isAr ? p.name_ar : p.name_en;
  };

  // Find family connections
  const parents = relationships
    .filter((r) => r.relationship_type === "parent_child" && r.related_person_id === person.id)
    .map((r) => getPersonById(r.person_id))
    .filter(Boolean);

  const children = relationships
    .filter((r) => r.relationship_type === "parent_child" && r.person_id === person.id)
    .map((r) => getPersonById(r.related_person_id))
    .filter(Boolean);

  const spouses = relationships
    .filter((r) => r.relationship_type === "spouse" && (r.person_id === person.id || r.related_person_id === person.id))
    .map((r) => getPersonById(r.person_id === person.id ? r.related_person_id : r.person_id))
    .filter(Boolean);

  const parentIds = parents.map((p) => p.id);
  const siblings = relationships
    .filter((r) => r.relationship_type === "parent_child" && parentIds.includes(r.person_id) && r.related_person_id !== person.id)
    .map((r) => getPersonById(r.related_person_id))
    .filter(Boolean);
  const uniqueSiblings = [...new Map(siblings.map((s) => [s.id, s])).values()];

  // Descendant stats
  const getChildIds = (pid) =>
    relationships
      .filter((r) => r.relationship_type === "parent_child" && r.person_id === pid)
      .map((r) => r.related_person_id);

  const grandchildCount = [...new Set(children.flatMap((c) => getChildIds(c.id)))].length;

  const getAllDescendantCount = (startId) => {
    const visited = new Set();
    const queue = [startId];
    while (queue.length) {
      const pid = queue.shift();
      for (const cid of getChildIds(pid)) {
        if (!visited.has(cid)) {
          visited.add(cid);
          queue.push(cid);
        }
      }
    }
    return visited.size;
  };

  const totalDescendants = children.length > 0 ? getAllDescendantCount(person.id) : 0;

  const labels = isAr
    ? { parents: "الوالدين", spouse: "الزوج/الزوجة", children: "الأبناء", siblings: "الإخوة", addRelative: "إضافة قريب", close: "إغلاق" }
    : { parents: "Parents", spouse: "Spouse", children: "Children", siblings: "Siblings", addRelative: "Add Relative", close: "Close" };

  const relativeLabels = isAr
    ? { father: "إضافة أب", mother: "إضافة أم", spouse: "إضافة زوج/زوجة", child: "إضافة ابن/بنت", sibling: "إضافة أخ/أخت" }
    : { father: "Add Father", mother: "Add Mother", spouse: "Add Spouse", child: "Add Child", sibling: "Add Sibling" };

  const handleStartAdd = (type) => {
    setShowAddForm(type);
    // Auto-set gender based on type
    if (type === "father") setNewRelative({ name_en: "", name_ar: "", gender: "male" });
    else if (type === "mother") setNewRelative({ name_en: "", name_ar: "", gender: "female" });
    else if (type === "spouse") setNewRelative({ name_en: "", name_ar: "", gender: person.gender === "male" ? "female" : "male" });
    else setNewRelative({ name_en: "", name_ar: "", gender: "male" });
    setMessage("");
  };

  const handleSubmitRelative = async () => {
    if (!newRelative.name_ar) {
      setMessage(isAr ? "يرجى إدخال الاسم بالعربي" : "Arabic name is required");
      return;
    }
    try {
      await submitContribution({
        contribution_type: "add_relative",
        data: JSON.stringify({
          person_id: person.id,
          person_name: person.name_ar,
          relative_type: showAddForm,
          name_en: newRelative.name_en,
          name_ar: newRelative.name_ar,
          gender: newRelative.gender,
        }),
      });
      setMessage(isAr ? "تم إرسال الطلب بنجاح ✓ سيتم مراجعته من قبل المسؤول" : "Request submitted ✓ Admin will review it");
      setShowAddForm(null);
      setNewRelative({ name_en: "", name_ar: "", gender: "male" });
    } catch (err) {
      setMessage(isAr ? "حدث خطأ" : "Error occurred");
    }
  };

  const handleDeletePerson = async () => {
    setShowDeleteConfirm(false);
    try {
      await deletePerson(person.id);
      onPersonDeleted(person.id);
    } catch (err) {
      setDeleteError(isAr ? "حدث خطأ أثناء الحذف" : "Error deleting person");
    }
  };

  const handleRequestDeletion = async () => {
    try {
      await submitContribution({
        contribution_type: "delete_person",
        data: JSON.stringify({ person_id: person.id, person_name: person.name_ar }),
      });
      setDeleteRequested(true);
    } catch {
      setMessage(isAr ? "حدث خطأ" : "Error occurred");
    }
  };

  const handleReportDeceased = async () => {
    try {
      await submitContribution({
        contribution_type: "mark_deceased",
        data: JSON.stringify({ person_id: person.id, person_name: person.name_ar }),
      });
      setDeceasedSubmitted(true);
      setMessage(isAr ? "تم إرسال الطلب ✓ سيتم مراجعته من قبل المسؤول" : "Request submitted ✓ Admin will review it");
    } catch {
      setMessage(isAr ? "حدث خطأ" : "Error occurred");
    }
  };

  const renderPersonList = (title, people) => {
    if (people.length === 0) return null;
    return (
      <div className="panel-section">
        <h3 className="panel-section-title">{title}</h3>
        <div className="panel-person-list">
          {people.map((p) => (
            <button
              key={p.id}
              className={`panel-person-chip ${p.gender}`}
              onClick={() => onPersonClick(p.id)}
            >
              {getName(p)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`person-panel ${isAr ? "rtl" : "ltr"}`}>
      <div className="panel-header">
        <div>
          <h2 className="panel-name">
            {getName(person)}
            {person.is_deceased && (
              <span className="panel-deceased-badge">{isAr ? " (متوفى)" : " (deceased)"}</span>
            )}
          </h2>
          <p className="panel-name-secondary">
            {isAr ? person.name_en : person.name_ar}
          </p>
        </div>
        <div className="panel-header-actions">
          {role === "admin" && (
            <button className="panel-delete-btn" onClick={() => setShowDeleteConfirm(true)}>
              {isAr ? "حذف" : "Delete"}
            </button>
          )}
          {role === "user" && !deleteRequested && (
            <button className="panel-delete-request-btn" onClick={handleRequestDeletion}>
              {isAr ? "طلب حذف" : "Request Deletion"}
            </button>
          )}
          {role === "user" && deleteRequested && (
            <span className="panel-delete-requested">{isAr ? "تم الإرسال ✓" : "Sent ✓"}</span>
          )}
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>
      </div>

      {deleteError && <p className="panel-delete-error">{deleteError}</p>}

      {showDeleteConfirm && (
        <ConfirmDialog
          language={language}
          message={
            isAr
              ? `هل أنت متأكد من حذف ${person.name_ar}؟ سيتم حذف جميع علاقاته أيضًا.`
              : `Are you sure you want to delete ${person.name_en}? All their relationships will be removed too.`
          }
          confirmLabel={isAr ? "حذف" : "Delete"}
          cancelLabel={isAr ? "إلغاء" : "Cancel"}
          onConfirm={handleDeletePerson}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <div className="panel-body">
        {children.length > 0 && (
          <div className="descendant-stats">
            <div className="descendant-stats-title">{isAr ? "الذرية" : "Descendants"}</div>
            <div className="descendant-stat-row">
              <span>{isAr ? "الأبناء المباشرون" : "Children"}</span>
              <span className="descendant-stat-value">{children.length}</span>
            </div>
            <div className="descendant-stat-row">
              <span>{isAr ? "الأحفاد" : "Grandchildren"}</span>
              <span className="descendant-stat-value">{grandchildCount}</span>
            </div>
            <div className="descendant-stat-row">
              <span>{isAr ? "جميع الذرية" : "All Descendants"}</span>
              <span className="descendant-stat-value">{totalDescendants}</span>
            </div>
          </div>
        )}
        {renderPersonList(labels.parents, parents)}
        {renderPersonList(labels.spouse, spouses)}
        {renderPersonList(labels.children, children)}
        {renderPersonList(labels.siblings, uniqueSiblings)}

        {/* REPORT DECEASED SECTION — users only, only if not already deceased */}
        {role === "user" && !person.is_deceased && (
          <div className="panel-section panel-deceased-section">
            {!deceasedSubmitted ? (
              <button className="report-deceased-btn" onClick={handleReportDeceased}>
                {isAr ? "الإبلاغ عن وفاة" : "Report as Deceased"}
              </button>
            ) : (
              <p className="panel-message">{message}</p>
            )}
          </div>
        )}

        {/* ADD RELATIVE SECTION */}
        <div className="panel-section panel-add-section">
          <h3 className="panel-section-title">{labels.addRelative}</h3>

          {message && <p className="panel-message">{message}</p>}

          {!showAddForm ? (
            <div className="add-relative-buttons">
              {missing.map((type) => (
                <button
                  key={type}
                  className="add-relative-btn"
                  onClick={() => handleStartAdd(type)}
                >
                  + {relativeLabels[type]}
                </button>
              ))}
            </div>
          ) : (
            <div className="add-relative-form">
              <p className="form-title">
                {relativeLabels[showAddForm]} {isAr ? `لـ ${person.name_ar}` : `for ${person.name_en}`}
              </p>
              <input
                type="text"
                value={newRelative.name_ar}
                onChange={(e) => setNewRelative({ ...newRelative, name_ar: e.target.value })}
                placeholder={isAr ? "الاسم بالعربي" : "Arabic name"}
                className="form-input"
                dir="rtl"
              />
              <input
                type="text"
                value={newRelative.name_en}
                onChange={(e) => setNewRelative({ ...newRelative, name_en: e.target.value })}
                placeholder={isAr ? "الاسم بالإنجليزي" : "English name"}
                className="form-input"
              />
              {(showAddForm === "child" || showAddForm === "sibling") && (
                <select
                  value={newRelative.gender}
                  onChange={(e) => setNewRelative({ ...newRelative, gender: e.target.value })}
                  className="form-input"
                >
                  <option value="male">{isAr ? "ذكر" : "Male"}</option>
                  <option value="female">{isAr ? "أنثى" : "Female"}</option>
                </select>
              )}
              <div className="form-actions">
                <button className="form-submit-sm" onClick={handleSubmitRelative}>
                  {isAr ? "إرسال الطلب" : "Submit Request"}
                </button>
                <button className="form-cancel" onClick={() => setShowAddForm(null)}>
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PersonPanel;
