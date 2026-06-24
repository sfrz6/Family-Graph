/**
 * UserMenu.jsx - Welcome popup for normal users.
 * 
 * After a normal user logs in, this popup appears with three choices:
 * 1. Search for relationship between two people (صلة القرابة)
 * 2. Search for a person (البحث عن شخص)
 * 3. Show all family tree (عرض الشجرة كاملة)
 * 
 * The admin skips this menu and goes straight to the admin dashboard.
 */

function UserMenu({ onSelect, language }) {
  const labels =
    language === "ar"
      ? {
          title: "شجرة العائلة",
          subtitle: "اختر ما تريد القيام به",
          relationship: "البحث عن صلة القرابة",
          relationshipDesc: "ابحث عن العلاقة بين شخصين",
          search: "البحث عن شخص",
          searchDesc: "ابحث عن فرد من العائلة",
          tree: "عرض الشجرة كاملة",
          treeDesc: "استعرض شجرة العائلة بالكامل",
        }
      : {
          title: "Family Graph",
          subtitle: "Choose what you'd like to do",
          relationship: "Find Relationship",
          relationshipDesc: "Find how two people are related",
          search: "Search for a Person",
          searchDesc: "Find a family member",
          tree: "Show Full Tree",
          treeDesc: "Browse the entire family tree",
        };

  return (
    <div className="user-menu-overlay">
      <div className={`user-menu ${language === "ar" ? "rtl" : "ltr"}`}>
        <h1 className="user-menu-title">{labels.title}</h1>
        <p className="user-menu-subtitle">{labels.subtitle}</p>

        <div className="user-menu-options">
          <button
            className="user-menu-option"
            onClick={() => onSelect("relationship")}
          >
            <span className="option-icon">🔗</span>
            <div className="option-text">
              <span className="option-label">{labels.relationship}</span>
              <span className="option-desc">{labels.relationshipDesc}</span>
            </div>
          </button>

          <button
            className="user-menu-option"
            onClick={() => onSelect("search")}
          >
            <span className="option-icon">🔍</span>
            <div className="option-text">
              <span className="option-label">{labels.search}</span>
              <span className="option-desc">{labels.searchDesc}</span>
            </div>
          </button>

          <button
            className="user-menu-option"
            onClick={() => onSelect("tree")}
          >
            <span className="option-icon">🌳</span>
            <div className="option-text">
              <span className="option-label">{labels.tree}</span>
              <span className="option-desc">{labels.treeDesc}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default UserMenu;
