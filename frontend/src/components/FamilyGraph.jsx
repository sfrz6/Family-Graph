/**
 * FamilyGraph.jsx - Main graph visualization.
 *
 * Supports multiple view modes:
 * - "tree": Full tree showing ONLY MALES first, to keep the initial view
 *   clean. Clicking any node (in the graph or the side panel) narrows the
 *   view to that person's depth-1 relatives (parents, spouse, children) -
 *   same narrowing behavior as "search".
 * - "search": Start with one node, click to re-center on depth-1 relatives.
 * - "relationship": Shows the relationship finder with two search inputs.
 *
 * Admin gets direct access to all features + admin panel.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import PersonNode from "./PersonNode";
import PersonPanel from "./PersonPanel";
import SearchPopup from "./SearchPopup";
import UserMenu from "./UserMenu";
import AdminPanel from "./AdminPanel";
import { getPersons, getRelationships, findRelationship } from "../api";

const nodeTypes = { person: PersonNode };

// --- Layout Helpers ---

function calculateGenerations(persons, relationships) {
  const childrenOf = {};
  const parentsOf = {};
  persons.forEach((p) => { childrenOf[p.id] = []; parentsOf[p.id] = []; });
  relationships
    .filter((r) => r.relationship_type === "parent_child")
    .forEach((r) => {
      if (childrenOf[r.person_id]) childrenOf[r.person_id].push(r.related_person_id);
      if (parentsOf[r.related_person_id]) parentsOf[r.related_person_id].push(r.person_id);
    });

  const generations = {};
  const visited = new Set();
  const queue = [];

  // Anchor stored-generation people first so children inherit the correct row,
  // even when a parent has no parent-links of their own in the system.
  persons.forEach((p) => {
    if (p.generation != null) {
      generations[p.id] = p.generation;
      visited.add(p.id);
      childrenOf[p.id].forEach((childId) => {
        if (!visited.has(childId)) queue.push({ id: childId, gen: p.generation + 1 });
      });
    }
  });

  // Seed BFS from true roots (no parents) that haven't been anchored yet.
  persons
    .filter((p) => parentsOf[p.id].length === 0 && !visited.has(p.id))
    .forEach((p) => queue.push({ id: p.id, gen: 1 }));

  while (queue.length > 0) {
    const { id, gen } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    generations[id] = gen;
    (childrenOf[id] || []).forEach((childId) => {
      if (!visited.has(childId)) queue.push({ id: childId, gen: gen + 1 });
    });
  }

  // Anyone still unvisited (isolated, no stored gen, no parents) defaults to row 1.
  persons.forEach((p) => {
    if (generations[p.id] === undefined) generations[p.id] = 1;
  });

  return generations;
}

function buildGraphData(persons, relationships, highlightedPath = [], layoutPositions = null) {
  let getPosition;

  if (layoutPositions) {
    getPosition = (p) => layoutPositions[p.id] || { x: 0, y: 0 };
  } else {
    const generations = calculateGenerations(persons, relationships);

    // Group by generation for layout
    const genGroups = {};
    persons.forEach((p) => {
      const gen = generations[p.id] || 0;
      if (!genGroups[gen]) genGroups[gen] = [];
      genGroups[gen].push(p);
    });

    const HORIZONTAL_SPACING = 200;
    const VERTICAL_SPACING = 160;

    // Position spouses near each other
    const spouseAdj = {};
    relationships.filter((r) => r.relationship_type === "spouse").forEach((r) => {
      if (persons.find((p) => p.id === r.person_id) && persons.find((p) => p.id === r.related_person_id)) {
        spouseAdj[r.person_id] = -70;
        spouseAdj[r.related_person_id] = 70;
      }
    });

    getPosition = (p) => {
      const gen = generations[p.id] || 0;
      const group = genGroups[gen];
      const idx = group.indexOf(p);
      const total = group.length;
      const startX = -(total - 1) * HORIZONTAL_SPACING * 0.5;
      const x = startX + idx * HORIZONTAL_SPACING + (spouseAdj[p.id] || 0);
      const y = (gen - 1) * VERTICAL_SPACING; // gen 1 → y=0, gen 2 → y=160, etc.
      return { x, y };
    };
  }

  const nodes = persons.map((p) => ({
    id: String(p.id),
    type: "person",
    position: getPosition(p),
    data: {
      ...p,
      highlighted: highlightedPath.includes(p.id),
    },
  }));

  const highlightedSet = new Set(highlightedPath.map(String));
  const edges = relationships
    .filter((r) => {
      // Only show edges for persons currently visible
      return persons.find((p) => p.id === r.person_id) && persons.find((p) => p.id === r.related_person_id);
    })
    .map((r) => {
      const sourceId = String(r.person_id);
      const targetId = String(r.related_person_id);
      const isSpouse = r.relationship_type === "spouse";
      const isDivorced = r.relationship_type === "divorced";
      const isHighlighted = highlightedSet.has(sourceId) && highlightedSet.has(targetId);

      return {
        id: `e${r.id}`,
        source: sourceId,
        target: targetId,
        type: "default",
        style: {
          stroke: isHighlighted ? "#f59e0b" : isSpouse ? "#e11d48" : isDivorced ? "#eab308" : "#6b7280",
          strokeWidth: isHighlighted ? 3 : (isSpouse || isDivorced) ? 2 : 1.5,
          strokeDasharray: isSpouse ? "6 3" : isDivorced ? "3 3" : "none",
        },
        animated: isHighlighted,
      };
    });

  return { nodes, edges };
}

// Get depth-1 neighborhood of a person
function getDepthOne(personId, persons, relationships) {
  const neighborIds = new Set([personId]);
  relationships.forEach((r) => {
    if (r.person_id === personId) neighborIds.add(r.related_person_id);
    if (r.related_person_id === personId) neighborIds.add(r.person_id);
  });
  return {
    persons: persons.filter((p) => neighborIds.has(p.id)),
    relationships: relationships.filter((r) => neighborIds.has(r.person_id) && neighborIds.has(r.related_person_id)),
  };
}

// Custom 3-row layout for depth-1 views: parents on top, the centered
// person + spouse(s) in the middle, children on the bottom. The generic
// generation-based layout doesn't work for this case because a spouse
// brought in by marriage has no parent links within this subset, so it
// gets miscounted as a "root" alongside the real parents, which then
// pushes the children up onto the same row as the centered person.
function buildDepthOneLayout(centeredId, persons, relationships) {
  const parents = [];
  const spouses = [];
  const children = [];

  relationships.forEach((r) => {
    if (r.relationship_type === "parent_child") {
      if (r.related_person_id === centeredId) {
        const parent = persons.find((p) => p.id === r.person_id);
        if (parent) parents.push(parent);
      } else if (r.person_id === centeredId) {
        const child = persons.find((p) => p.id === r.related_person_id);
        if (child) children.push(child);
      }
    } else if (r.relationship_type === "spouse") {
      const spouseId = r.person_id === centeredId ? r.related_person_id
        : r.related_person_id === centeredId ? r.person_id
        : null;
      if (spouseId !== null) {
        const spouse = persons.find((p) => p.id === spouseId);
        if (spouse) spouses.push(spouse);
      }
    }
  });

  const centered = persons.find((p) => p.id === centeredId);
  const HORIZONTAL_SPACING = 200;
  const VERTICAL_SPACING = 160;
  const positions = {};

  const layoutRow = (row, y) => {
    const startX = -(row.length - 1) * HORIZONTAL_SPACING * 0.5;
    row.forEach((p, i) => {
      positions[p.id] = { x: startX + i * HORIZONTAL_SPACING, y };
    });
  };

  layoutRow(parents, 0);
  layoutRow(centered ? [centered, ...spouses] : spouses, VERTICAL_SPACING);
  layoutRow(children, VERTICAL_SPACING * 2);

  return positions;
}

// Males-only view for the initial tree.
// Only includes males reachable from a generation-1 root (no parents)
// through an unbroken chain of male→male_child links.
// Males whose paternal chain is broken (e.g. only a mother in the system)
// are excluded — they appear correctly in the clicked/search expanded view.
function getMalesView(persons, relationships) {
  const personMap = {};
  persons.forEach((p) => { personMap[p.id] = p; });

  const parentsOf = {};
  const childrenOf = {};
  persons.forEach((p) => { parentsOf[p.id] = []; childrenOf[p.id] = []; });
  relationships
    .filter((r) => r.relationship_type === "parent_child")
    .forEach((r) => {
      if (parentsOf[r.related_person_id]) parentsOf[r.related_person_id].push(r.person_id);
      if (childrenOf[r.person_id]) childrenOf[r.person_id].push(r.related_person_id);
    });

  // BFS from gen-1 male roots → propagate only through male children
  const validMaleIds = new Set();
  const queue = [];
  persons.forEach((p) => {
    if (p.gender === "male" && parentsOf[p.id].length === 0) {
      validMaleIds.add(p.id);
      queue.push(p.id);
    }
  });

  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    (childrenOf[id] || []).forEach((childId) => {
      const child = personMap[childId];
      if (child && child.gender === "male" && !validMaleIds.has(childId)) {
        validMaleIds.add(childId);
        queue.push(childId);
      }
    });
  }

  const males = persons.filter((p) => p.gender === "male" && validMaleIds.has(p.id));
  const maleIds = new Set(males.map((p) => p.id));
  return {
    persons: males,
    relationships: relationships.filter((r) => maleIds.has(r.person_id) && maleIds.has(r.related_person_id)),
  };
}

// Expanded view centered on one person — 5 rows:
//   Row 0 — grandparents (parents of parents)
//   Row 1 — parents
//   Row 2 — centered person + their spouses / ex-spouses
//   Row 3 — children
//   Row 4 — grandchildren (children of children)
function buildExpandedView(centeredId, allPersons, allRelationships) {
  const personMap = {};
  allPersons.forEach((p) => { personMap[p.id] = p; });

  const parentsOf = {};
  const childrenOf = {};
  const partnersOf = {};
  allPersons.forEach((p) => { parentsOf[p.id] = []; childrenOf[p.id] = []; partnersOf[p.id] = []; });

  allRelationships.forEach((r) => {
    if (r.relationship_type === "parent_child") {
      if (parentsOf[r.related_person_id]) parentsOf[r.related_person_id].push(r.person_id);
      if (childrenOf[r.person_id]) childrenOf[r.person_id].push(r.related_person_id);
    } else if (r.relationship_type === "spouse" || r.relationship_type === "divorced") {
      if (partnersOf[r.person_id]) partnersOf[r.person_id].push(r.related_person_id);
      if (partnersOf[r.related_person_id]) partnersOf[r.related_person_id].push(r.person_id);
    }
  });

  const myPartners  = partnersOf[centeredId] || [];
  const myParents   = parentsOf[centeredId]   || [];
  const myChildren  = childrenOf[centeredId]  || [];

  const grandparents = [];
  myParents.forEach((pid) => {
    (parentsOf[pid] || []).forEach((gpId) => {
      if (!grandparents.includes(gpId)) grandparents.push(gpId);
    });
  });

  const grandchildren = [];
  myChildren.forEach((cid) => {
    (childrenOf[cid] || []).forEach((gcId) => {
      if (!grandchildren.includes(gcId)) grandchildren.push(gcId);
    });
  });

  const includedIds = new Set([
    centeredId, ...myPartners, ...myParents, ...grandparents,
    ...myChildren, ...grandchildren,
  ]);

  const displayPersons = allPersons.filter((p) => includedIds.has(p.id));
  const displayRels = allRelationships.filter(
    (r) => includedIds.has(r.person_id) && includedIds.has(r.related_person_id)
  );

  const H = 200;
  const V = 160;
  const positions = {};

  const layoutRow = (ids, y) => {
    const valid = ids.filter((id) => personMap[id]);
    const startX = -(valid.length - 1) * H * 0.5;
    valid.forEach((id, i) => { positions[id] = { x: startX + i * H, y }; });
  };

  layoutRow(grandparents,               0);
  layoutRow(myParents,                  V);
  layoutRow([centeredId, ...myPartners], V * 2);
  layoutRow(myChildren,                 V * 3);
  layoutRow(grandchildren,              V * 4);

  return { persons: displayPersons, relationships: displayRels, positions };
}

// BFS for path (kept for highlighting)
function findPathLocal(startId, endId, relationships) {
  if (startId === endId) return [startId];
  const adj = {};
  relationships.forEach((r) => {
    if (!adj[r.person_id]) adj[r.person_id] = [];
    if (!adj[r.related_person_id]) adj[r.related_person_id] = [];
    adj[r.person_id].push(r.related_person_id);
    adj[r.related_person_id].push(r.person_id);
  });
  const queue = [[startId]];
  const visited = new Set([startId]);
  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    for (const neighbor of adj[current] || []) {
      if (neighbor === endId) return [...path, neighbor];
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push([...path, neighbor]); }
    }
  }
  return [];
}


// ================================================
// Main Component
// ================================================

function FamilyGraphInner({ role, onLogout, language, setLanguage }) {
  const [persons, setPersons] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [userMode, setUserMode] = useState(null); // "search" | "relationship" | "tree"
  const [centeredPersonId, setCenteredPersonId] = useState(null);
  const [viewHistory, setViewHistory] = useState([]); // stack of previous centeredPersonId values
  const [relationshipResult, setRelationshipResult] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(role === "user");
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [graphFading, setGraphFading] = useState(false);

  const { fitView } = useReactFlow();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [p, r] = await Promise.all([getPersons(), getRelationships()]);
      setPersons(p);
      setRelationships(r);
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchData(); }, [dataVersion]);

  // Rebuild graph when data or view changes
  useEffect(() => {
    if (persons.length === 0) return;

    setGraphFading(true);

    let displayPersons = persons;
    let displayRels = relationships;
    let highlightedPath = [];
    let layoutPositions = null;

    if (userMode === "tree") {
      if (centeredPersonId) {
        const view = buildExpandedView(centeredPersonId, persons, relationships);
        displayPersons = view.persons;
        displayRels = view.relationships;
        layoutPositions = view.positions;
      } else {
        // Nothing clicked yet - initial males-only tree
        const view = getMalesView(persons, relationships);
        displayPersons = view.persons;
        displayRels = view.relationships;
      }
    } else if (userMode === "search" && centeredPersonId) {
      const view = buildExpandedView(centeredPersonId, persons, relationships);
      displayPersons = view.persons;
      displayRels = view.relationships;
      layoutPositions = view.positions;
    }

    if (relationshipResult?.path?.length > 0) {
      highlightedPath = relationshipResult.path;
      // Show only the people on the path between the two searched persons,
      // not the whole graph - keeps the result focused and uncluttered.
      const pathSet = new Set(highlightedPath);
      displayPersons = persons.filter((p) => pathSet.has(p.id));
      displayRels = relationships.filter((r) => pathSet.has(r.person_id) && pathSet.has(r.related_person_id));
      layoutPositions = null;
    }

    const { nodes: n, edges: e } = buildGraphData(displayPersons, displayRels, highlightedPath, layoutPositions);
    setNodes(n);
    setEdges(e);
    setTimeout(() => {
      fitView({ padding: 0.3, duration: 500 });
      setGraphFading(false);
    }, 100);
  }, [persons, relationships, userMode, centeredPersonId, relationshipResult]);

  const onNodeClick = useCallback((event, node) => {
    const person = persons.find((p) => p.id === Number(node.id));
    if (!person) return;

    if (userMode === "tree" || userMode === "search") {
      // Re-center on this person - show just them and their depth-1 relatives
      setViewHistory((prev) => [...prev, centeredPersonId]);
      setCenteredPersonId(person.id);
    }

    setSelectedPerson(person);
  }, [persons, userMode, centeredPersonId]);

  const handleSelectPerson = useCallback((personId) => {
    setCenteredPersonId(personId);
    setViewHistory([]);
    setUserMode("search");
    setRelationshipResult(null);
    setSelectedPerson(persons.find((p) => p.id === personId));
    setShowSearchPopup(false);
  }, [persons]);

  const handlePanelPersonClick = useCallback((personId) => {
    if (userMode === "tree" || userMode === "search") {
      setViewHistory((prev) => [...prev, centeredPersonId]);
      setCenteredPersonId(personId);
    }
    setSelectedPerson(persons.find((p) => p.id === personId));
  }, [persons, userMode, centeredPersonId]);

  const handleBack = useCallback(() => {
    setViewHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const previousId = next.pop();
      setCenteredPersonId(previousId);
      setSelectedPerson(previousId ? persons.find((p) => p.id === previousId) : null);
      return next;
    });
  }, [persons]);

  const handleFindRelationship = useCallback(async (id1, id2) => {
    try {
      const result = await findRelationship(id1, id2);
      setRelationshipResult(result);
      setUserMode("relationship");
      setSelectedPerson(null);
    } catch {
      setRelationshipResult({
        path: [],
        relationship_en: "", relationship_ar: "",
        description_en: "No connection found.",
        description_ar: "لا توجد صلة بين هذين الشخصين.",
      });
    } finally {
      setShowSearchPopup(false);
    }
  }, []);

  const handleUserMenuSelect = (mode) => {
    setShowUserMenu(false);
    setUserMode(mode);
    setRelationshipResult(null);
    setCenteredPersonId(null);
    setViewHistory([]);
    setSelectedPerson(null);
    setShowSearchPopup(mode === "search" || mode === "relationship");
  };

  const handleDataChanged = () => setDataVersion((v) => v + 1);

  const handlePersonDeleted = useCallback((personId) => {
    setSelectedPerson(null);
    setCenteredPersonId((prev) => (prev === personId ? null : prev));
    setViewHistory([]);
    setDataVersion((v) => v + 1);
  }, []);

  const isAr = language === "ar";
  const labels = isAr
    ? { title: "شجرة العائلة", logout: "خروج", admin: "لوحة الإدارة", menu: "القائمة", tree: "الشجرة", search: "بحث", relationship: "صلة القرابة", treeHint: "اضغط على أي اسم لإظهار القريبات", empty: "لا يوجد أفراد" }
    : { title: "Family Graph", logout: "Logout", admin: "Admin Panel", menu: "Menu", tree: "Tree", search: "Search", relationship: "Relationship", treeHint: "Click any name to see their relatives", empty: "No family members yet" };

  return (
    <div className={`app-container ${isAr ? "rtl" : "ltr"}`}>
      {/* User Menu Popup */}
      {showUserMenu && (
        <UserMenu onSelect={handleUserMenuSelect} language={language} />
      )}

      {/* Admin Panel Popup */}
      {showAdminPanel && (
        <AdminPanel
          language={language}
          onDataChanged={handleDataChanged}
          onClose={() => setShowAdminPanel(false)}
        />
      )}

      {/* Search / Relationship Popup */}
      {showSearchPopup && (
        <SearchPopup
          persons={persons}
          relationships={relationships}
          onSelectPerson={handleSelectPerson}
          onFindRelationship={handleFindRelationship}
          language={language}
          forceMode={userMode === "relationship" ? "relationship" : "search"}
          onClose={() => setShowSearchPopup(false)}
        />
      )}

      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="header-title">{labels.title}</h1>

          {/* Mode tabs for quick switching */}
          {!showUserMenu && (
            <div className="mode-tabs">
              <button
                className={`mode-tab ${userMode === "tree" ? "active" : ""}`}
                onClick={() => handleUserMenuSelect("tree")}
              >
                {labels.tree}
              </button>
              <button
                className={`mode-tab ${userMode === "search" ? "active" : ""}`}
                onClick={() => handleUserMenuSelect("search")}
              >
                {labels.search}
              </button>
              <button
                className={`mode-tab ${userMode === "relationship" ? "active" : ""}`}
                onClick={() => handleUserMenuSelect("relationship")}
              >
                {labels.relationship}
              </button>
            </div>
          )}
        </div>

        {/* Reopen the search/relationship popup */}
        {(userMode === "search" || userMode === "relationship") && (
          <button
            className="search-reopen-btn"
            onClick={() => setShowSearchPopup(true)}
          >
            🔍 {userMode === "relationship" ? labels.relationship : labels.search}
          </button>
        )}

        <div className="header-right">
          <button
            className="lang-btn"
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
          >
            {language === "en" ? "العربية" : "English"}
          </button>
          {role === "admin" && (
            <button className="admin-btn" onClick={() => setShowAdminPanel(true)}>
              {labels.admin}
            </button>
          )}
          <button className="logout-btn" onClick={onLogout}>{labels.logout}</button>
        </div>
      </header>

      {/* Tree mode hint */}
      {userMode === "tree" && (
        <div className="tree-hint">{labels.treeHint}</div>
      )}

      {/* Relationship result banner */}
      {relationshipResult && relationshipResult.path?.length > 0 && (
        <div className="relationship-banner">
          <div className="relationship-result">
            <span className="relationship-description">
              {isAr ? relationshipResult.description_ar : relationshipResult.description_en}
            </span>
            <span className="relationship-term">
              {isAr ? relationshipResult.relationship_ar : relationshipResult.relationship_en}
            </span>
            <span className="relationship-path" dir={isAr ? "rtl" : "ltr"}>
              {relationshipResult.path
                .map((id) => {
                  const p = persons.find((per) => per.id === id);
                  return p ? (isAr ? p.name_ar : p.name_en) : "?";
                })
                .join(isAr ? " ← " : " → ")}
            </span>
          </div>
          <button className="banner-close" onClick={() => setRelationshipResult(null)}>✕</button>
        </div>
      )}
      {relationshipResult && (!relationshipResult.path || relationshipResult.path.length === 0) && (
        <div className="relationship-banner">
          <span>{isAr ? relationshipResult.description_ar : relationshipResult.description_en}</span>
          <button className="banner-close" onClick={() => setRelationshipResult(null)}>✕</button>
        </div>
      )}

      {/* Graph */}
      <div className={`graph-container ${graphFading ? "graph-fading" : ""}`}>
        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner" />
          </div>
        )}
        {!isLoading && persons.length === 0 && (
          <div className="empty-state">{labels.empty}</div>
        )}
        {viewHistory.length > 0 && (userMode === "tree" || userMode === "search") && (
          <button className={`back-btn ${isAr ? "rtl" : "ltr"}`} onClick={handleBack}>
            ↩ {isAr ? "رجوع" : "Back"}
          </button>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
        >
          <Controls />
          <Background color="#e2e8f0" gap={20} />
        </ReactFlow>
      </div>

      {/* Person panel */}
      <PersonPanel
        person={selectedPerson}
        persons={persons}
        relationships={relationships}
        onClose={() => setSelectedPerson(null)}
        onPersonClick={handlePanelPersonClick}
        onPersonDeleted={handlePersonDeleted}
        language={language}
        role={role}
      />
    </div>
  );
}

function FamilyGraph(props) {
  return (
    <ReactFlowProvider>
      <FamilyGraphInner {...props} />
    </ReactFlowProvider>
  );
}

export default FamilyGraph;
