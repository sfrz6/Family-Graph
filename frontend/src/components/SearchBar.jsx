/**
 * SearchBar.jsx - Search and Relationship Finder.
 * 
 * Two modes:
 * 1. Single Search: type a name → jumps to that person in the graph
 * 2. Relationship Finder: type two names → shows how they're related
 * 
 * DISAMBIGUATION: When multiple people share the same name (common in
 * Arab families), each suggestion shows the father's name to tell them apart.
 * Example: "Ahmed bin Khalid" vs "Ahmed bin Salim"
 * In Arabic: "أحمد بن خالد" vs "أحمد بن سالم"
 * 
 * The component now receives `relationships` as a prop so it can
 * look up each person's father from the parent_child links.
 */

import { useState, useRef, useEffect, useMemo } from "react";

function SearchBar({ persons, relationships, onSelectPerson, onFindRelationship, language, forceMode }) {
  const [mode, setMode] = useState(forceMode || "search");

  // Sync mode with forceMode when parent changes it
  useEffect(() => {
    if (forceMode) setMode(forceMode);
  }, [forceMode]);
  const [query1, setQuery1] = useState("");
  const [query2, setQuery2] = useState("");
  const [suggestions1, setSuggestions1] = useState([]);
  const [suggestions2, setSuggestions2] = useState([]);
  const [selected1, setSelected1] = useState(null);
  const [selected2, setSelected2] = useState(null);
  const [activeInput, setActiveInput] = useState(null);
  const [dropdownOpen1, setDropdownOpen1] = useState(false);
  const [dropdownOpen2, setDropdownOpen2] = useState(false);

  const ref1 = useRef(null);
  const ref2 = useRef(null);

  // Build a lookup: personId → father person object
  // We do this once with useMemo so it doesn't recalculate on every render
  const fatherOf = useMemo(() => {
    const map = {};
    if (!relationships || !persons) return map;

    relationships
      .filter((r) => r.relationship_type === "parent_child")
      .forEach((r) => {
        // r.person_id is the parent, r.related_person_id is the child
        const parent = persons.find((p) => p.id === r.person_id);
        if (parent && parent.gender === "male") {
          map[r.related_person_id] = parent;
        }
      });

    return map;
  }, [persons, relationships]);

  // Get display name with father for disambiguation
  // English: "Ahmed bin Khalid" or just "Ahmed" if no father
  // Arabic: "أحمد بن خالد" or just "أحمد" if no father
  const getFullName = (person) => {
    const father = fatherOf[person.id];
    if (language === "ar") {
      if (father) {
        const prefix = person.gender === "male" ? "بن" : "بنت";
        return `${person.name_ar} ${prefix} ${father.name_ar}`;
      }
      return person.name_ar;
    } else {
      if (father) {
        const prefix = person.gender === "male" ? "bin" : "bint";
        return `${person.name_en} ${prefix} ${father.name_en}`;
      }
      return person.name_en;
    }
  };

  // Short name (just first name) for the input field after selection
  const getShortName = (person) => {
    return language === "ar" ? person.name_ar : person.name_en;
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (ref1.current && !ref1.current.contains(e.target)) {
        setDropdownOpen1(false);
      }
      if (ref2.current && !ref2.current.contains(e.target)) {
        setDropdownOpen2(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Filter persons by what the user typed
  const filterPersons = (query) => {
    if (!query || query.length < 1) return [];
    const lower = query.toLowerCase();
    return persons.filter(
      (p) =>
        p.name_en.toLowerCase().includes(lower) ||
        p.name_ar.includes(query)
    );
  };

  const handleInput1 = (value) => {
    setQuery1(value);
    setSelected1(null);
    setSuggestions1(filterPersons(value));
    setDropdownOpen1(value.length > 0);
  };

  const handleInput2 = (value) => {
    setQuery2(value);
    setSelected2(null);
    setSuggestions2(filterPersons(value));
    setDropdownOpen2(value.length > 0);
  };

  const selectPerson1 = (person) => {
    setSelected1(person);
    setQuery1(getFullName(person));
    setSuggestions1([]);
    setDropdownOpen1(false);

    if (mode === "search") {
      onSelectPerson(person.id);
    }
  };

  const selectPerson2 = (person) => {
    setSelected2(person);
    setQuery2(getFullName(person));
    setSuggestions2([]);
    setDropdownOpen2(false);
  };

  const handleFindRelationship = () => {
    if (selected1 && selected2) {
      onFindRelationship(selected1.id, selected2.id);
    }
  };

  const labels =
    language === "ar"
      ? {
          search: "بحث",
          relationship: "صلة القرابة",
          placeholder1: "ابحث عن شخص...",
          person1: "الشخص الأول...",
          person2: "الشخص الثاني...",
          find: "ابحث",
          noResults: "لا توجد نتائج",
        }
      : {
          search: "Search",
          relationship: "Relationship",
          placeholder1: "Search for a person...",
          person1: "First person...",
          person2: "Second person...",
          find: "Find",
          noResults: "No results",
        };

  // Renders a suggestion dropdown item with father's name for disambiguation
  const renderSuggestion = (person, onSelect) => {
    const father = fatherOf[person.id];
    const name = language === "ar" ? person.name_ar : person.name_en;
    const fatherName = father
      ? language === "ar"
        ? father.name_ar
        : father.name_en
      : null;
    const prefix =
      person.gender === "male"
        ? language === "ar" ? "بن" : "bin"
        : language === "ar" ? "بنت" : "bint";

    return (
      <button
        key={person.id}
        className="suggestion-item"
        onClick={() => onSelect(person)}
      >
        <span className={`suggestion-dot ${person.gender}`} />
        <span className="suggestion-name">{name}</span>
        {fatherName && (
          <span className="suggestion-father">
            {prefix} {fatherName}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className={`search-bar ${language === "ar" ? "rtl" : ""}`}>
      <div className="search-mode-toggle">
        <button
          className={`mode-btn ${mode === "search" ? "active" : ""}`}
          onClick={() => setMode("search")}
        >
          {labels.search}
        </button>
        <button
          className={`mode-btn ${mode === "relationship" ? "active" : ""}`}
          onClick={() => setMode("relationship")}
        >
          {labels.relationship}
        </button>
      </div>

      <div className="search-inputs">
        <div className="search-input-wrapper" ref={ref1}>
          <input
            type="text"
            value={query1}
            onChange={(e) => handleInput1(e.target.value)}
            onFocus={() => setActiveInput(1)}
            placeholder={
              mode === "search" ? labels.placeholder1 : labels.person1
            }
            className="search-input"
          />
          {dropdownOpen1 && (
            <div className="suggestions-dropdown">
              {suggestions1.length > 0
                ? suggestions1.map((p) => renderSuggestion(p, selectPerson1))
                : <div className="no-results">{labels.noResults}</div>}
            </div>
          )}
        </div>

        {mode === "relationship" && (
          <>
            <span className="search-arrow">→</span>
            <div className="search-input-wrapper" ref={ref2}>
              <input
                type="text"
                value={query2}
                onChange={(e) => handleInput2(e.target.value)}
                onFocus={() => setActiveInput(2)}
                placeholder={labels.person2}
                className="search-input"
              />
              {dropdownOpen2 && (
                <div className="suggestions-dropdown">
                  {suggestions2.length > 0
                    ? suggestions2.map((p) => renderSuggestion(p, selectPerson2))
                    : <div className="no-results">{labels.noResults}</div>}
                </div>
              )}
            </div>
            <button
              className="find-btn"
              onClick={handleFindRelationship}
              disabled={!selected1 || !selected2}
            >
              {labels.find}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
