/**
 * SearchPopup.jsx - Modal wrapper around SearchBar.
 *
 * Shown right after the user picks "Find Relationship" or "Search for a
 * Person" from UserMenu, and again whenever they reopen search from the
 * header tabs. Wraps SearchBar in an overlay (same visual treatment as
 * UserMenu/AdminPanel) so search reads as a deliberate step instead of a
 * permanent header fixture.
 */

import SearchBar from "./SearchBar";

function SearchPopup({ persons, relationships, onSelectPerson, onFindRelationship, language, forceMode, onClose }) {
  const isAr = language === "ar";
  const title =
    forceMode === "relationship"
      ? isAr ? "البحث عن صلة القرابة" : "Find Relationship"
      : isAr ? "البحث عن شخص" : "Search for a Person";

  return (
    <div className="search-popup-overlay">
      <div className={`search-popup ${isAr ? "rtl" : "ltr"}`}>
        <div className="search-popup-header">
          <h2>{title}</h2>
          <button className="banner-close" onClick={onClose}>✕</button>
        </div>
        <div className="search-popup-body">
          <SearchBar
            persons={persons}
            relationships={relationships}
            onSelectPerson={onSelectPerson}
            onFindRelationship={onFindRelationship}
            language={language}
            forceMode={forceMode}
          />
        </div>
      </div>
    </div>
  );
}

export default SearchPopup;
