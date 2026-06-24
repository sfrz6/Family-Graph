"""
relationship_finder.py - Kinship calculation engine.

Supports 5+ generations with proper Arabic/English naming.

Arabic kinship is extremely precise:
- Paternal vs maternal distinction at every level
- Different words for father's side (عم/عمة) vs mother's side (خال/خالة)
- Specific terms for great-grandparents, great-uncles, etc.
"""

from sqlalchemy.orm import Session
from .models import Person, Relationship
from collections import deque


def build_graph(db: Session):
    persons = db.query(Person).all()
    relationships = db.query(Relationship).all()

    persons_map = {p.id: p for p in persons}
    children_of = {}
    parents_of = {}
    spouses_of = {}

    for p in persons:
        children_of[p.id] = []
        parents_of[p.id] = []
        spouses_of[p.id] = []

    for r in relationships:
        if r.relationship_type == "parent_child":
            children_of[r.person_id].append(r.related_person_id)
            parents_of[r.related_person_id].append(r.person_id)
        elif r.relationship_type == "spouse":
            spouses_of[r.person_id].append(r.related_person_id)
            spouses_of[r.related_person_id].append(r.person_id)

    return persons_map, children_of, parents_of, spouses_of


def find_path_bfs(start_id, end_id, children_of, parents_of, spouses_of):
    if start_id == end_id:
        return [(start_id, None)]

    queue = deque([(start_id, [(start_id, None)])])
    visited = {start_id}

    while queue:
        current, path = queue.popleft()

        for parent_id in parents_of.get(current, []):
            if parent_id not in visited:
                new_path = path + [(parent_id, "up")]
                if parent_id == end_id:
                    return new_path
                visited.add(parent_id)
                queue.append((parent_id, new_path))

        for child_id in children_of.get(current, []):
            if child_id not in visited:
                new_path = path + [(child_id, "down")]
                if child_id == end_id:
                    return new_path
                visited.add(child_id)
                queue.append((child_id, new_path))

        for spouse_id in spouses_of.get(current, []):
            if spouse_id not in visited:
                new_path = path + [(spouse_id, "spouse")]
                if spouse_id == end_id:
                    return new_path
                visited.add(spouse_id)
                queue.append((spouse_id, new_path))

    return []


def analyze_path(path, persons_map):
    steps = [step_type for _, step_type in path if step_type is not None]
    person_ids = [pid for pid, _ in path]
    genders = [persons_map[pid].gender for pid in person_ids]
    persons = [persons_map[pid] for pid in person_ids]
    return steps, genders, persons


def get_relationship(start_id, end_id, db: Session):
    persons_map, children_of, parents_of, spouses_of = build_graph(db)

    if start_id not in persons_map or end_id not in persons_map:
        return None

    path = find_path_bfs(start_id, end_id, children_of, parents_of, spouses_of)

    if not path:
        return None

    steps, genders, persons = analyze_path(path, persons_map)
    path_ids = [pid for pid, _ in path]

    start_person = persons_map[start_id]
    end_person = persons_map[end_id]

    rel_en = interpret_english(steps, genders, persons)
    rel_ar = interpret_arabic(steps, genders, persons)

    pronoun_ar = "هي" if end_person.gender == "female" else "هو"

    description_en = f"{end_person.name_en} is {start_person.name_en}'s {rel_en}"
    description_ar = f"{end_person.name_ar} {pronoun_ar} {rel_ar} {start_person.name_ar}"

    return {
        "path": path_ids,
        "relationship_en": rel_en,
        "relationship_ar": rel_ar,
        "description_en": description_en,
        "description_ar": description_ar,
        "steps": steps,
    }


# ============================================================
#   ENGLISH INTERPRETATION
# ============================================================

def interpret_english(steps, genders, persons):
    end_gender = genders[-1]
    is_male = end_gender == "male"

    ups = 0
    downs = 0
    has_spouse = False
    spouse_position = -1

    for i, s in enumerate(steps):
        if s == "up":
            ups += 1
        elif s == "down":
            downs += 1
        elif s == "spouse":
            has_spouse = True
            spouse_position = i

    # --- SPOUSE ---
    if has_spouse and len(steps) == 1:
        return "husband" if is_male else "wife"

    if has_spouse:
        if spouse_position == 0:
            remaining = steps[1:]
            r_ups = remaining.count("up")
            r_downs = remaining.count("down")
            if remaining == ["up"]:
                return "father-in-law" if genders[-1] == "male" else "mother-in-law"
            if remaining == ["down"]:
                return "step-son" if is_male else "step-daughter"
            if remaining == ["up", "down"]:
                return "brother-in-law" if is_male else "sister-in-law"
            if r_ups == 2 and r_downs == 0:
                return "spouse's grandfather" if genders[-1] == "male" else "spouse's grandmother"

        if spouse_position == len(steps) - 1:
            preceding = steps[:-1]
            if preceding == ["down"]:
                return "son-in-law" if is_male else "daughter-in-law"
            if preceding == ["up"]:
                return "step-father" if is_male else "step-mother"
            if preceding == ["up", "down"]:
                return "brother-in-law" if is_male else "sister-in-law"
            if preceding == ["down", "down"]:
                return "grandson-in-law" if is_male else "granddaughter-in-law"

        return "relative by marriage"

    # --- DIRECT ANCESTORS (only ups) ---
    if downs == 0 and ups > 0:
        if ups == 1:
            return "father" if is_male else "mother"
        elif ups == 2:
            return "grandfather" if is_male else "grandmother"
        else:
            greats = "great-" * (ups - 2)
            return f"{greats}grandfather" if is_male else f"{greats}grandmother"

    # --- DIRECT DESCENDANTS (only downs) ---
    if ups == 0 and downs > 0:
        if downs == 1:
            return "son" if is_male else "daughter"
        elif downs == 2:
            return "grandson" if is_male else "granddaughter"
        else:
            greats = "great-" * (downs - 2)
            return f"{greats}grandson" if is_male else f"{greats}granddaughter"

    # --- COLLATERAL (ups AND downs) ---
    # Siblings
    if ups == 1 and downs == 1:
        return "brother" if is_male else "sister"

    # Uncle/Aunt
    if ups == 2 and downs == 1:
        return "uncle" if is_male else "aunt"

    # Nephew/Niece
    if ups == 1 and downs == 2:
        return "nephew" if is_male else "niece"

    # First cousins
    if ups == 2 and downs == 2:
        return "first cousin"

    # Great-uncle/aunt
    if ups == 3 and downs == 1:
        return "great-uncle" if is_male else "great-aunt"

    # Great-nephew/niece
    if ups == 1 and downs == 3:
        return "great-nephew" if is_male else "great-niece"

    # Great-great-uncle/aunt
    if ups == 4 and downs == 1:
        return "great-great-uncle" if is_male else "great-great-aunt"

    # Great-great-nephew/niece
    if ups == 1 and downs == 4:
        return "great-great-nephew" if is_male else "great-great-niece"

    # Cousin removals
    if ups == 3 and downs == 2:
        return "first cousin once removed (parent's cousin)"
    if ups == 2 and downs == 3:
        return "first cousin once removed (cousin's child)"
    if ups == 3 and downs == 3:
        return "second cousin"
    if ups == 4 and downs == 2:
        return "first cousin twice removed"
    if ups == 2 and downs == 4:
        return "first cousin twice removed"
    if ups == 4 and downs == 3:
        return "second cousin once removed"
    if ups == 3 and downs == 4:
        return "second cousin once removed"
    if ups == 4 and downs == 4:
        return "third cousin"
    if ups == 5 and downs == 5:
        return "fourth cousin"

    # General fallback with generation info
    if ups > 0 and downs > 0:
        min_gen = min(ups, downs)
        removed = abs(ups - downs)
        if removed == 0:
            ordinals = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth"}
            cousin_ord = ordinals.get(min_gen - 1, f"{min_gen-1}th")
            return f"{cousin_ord} cousin"
        else:
            ordinals = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth"}
            cousin_ord = ordinals.get(min_gen - 1, f"{min_gen-1}th")
            times = {1: "once", 2: "twice", 3: "thrice"}
            removed_str = times.get(removed, f"{removed} times")
            return f"{cousin_ord} cousin {removed_str} removed"

    return "relative"


# ============================================================
#   ARABIC INTERPRETATION
# ============================================================

def interpret_arabic(steps, genders, persons):
    end_gender = genders[-1]
    is_male = end_gender == "male"

    ups = sum(1 for s in steps if s == "up")
    downs = sum(1 for s in steps if s == "down")
    has_spouse = "spouse" in steps

    # Determine paternal vs maternal for the FIRST up step
    # genders[0] = start person
    # genders[1] = first person we go up to (if going up)
    first_up_gender = None
    if ups > 0:
        for i, s in enumerate(steps):
            if s == "up":
                first_up_gender = genders[i + 1]  # gender of person we went up to
                break

    # --- SPOUSE ---
    if has_spouse and len(steps) == 1:
        return "زوج" if is_male else "زوجة"

    if has_spouse:
        spouse_pos = steps.index("spouse")
        if spouse_pos == 0:
            remaining = steps[1:]
            if remaining == ["up"]:
                return "حمو" if genders[-1] == "male" else "حماة"
            if remaining == ["down"]:
                return "ابن الزوج/الزوجة" if is_male else "بنت الزوج/الزوجة"
            if remaining == ["up", "down"]:
                return "أخو الزوج/الزوجة" if is_male else "أخت الزوج/الزوجة"
            if remaining.count("up") == 2 and remaining.count("down") == 0:
                return "جد الزوج/الزوجة" if genders[-1] == "male" else "جدة الزوج/الزوجة"
        if spouse_pos == len(steps) - 1:
            preceding = steps[:-1]
            if preceding == ["down"]:
                return "زوج البنت" if is_male else "زوجة الابن"
            if preceding == ["up"]:
                return "زوج الأم" if is_male else "زوجة الأب"
            if preceding == ["up", "down"]:
                return "زوج الأخت" if is_male else "زوجة الأخ"
            if preceding == ["down", "down"]:
                return "زوج الحفيدة" if is_male else "زوجة الحفيد"
        return "قريب بالمصاهرة"

    # --- DIRECT ANCESTORS ---
    if downs == 0 and ups > 0:
        if ups == 1:
            return "أب" if is_male else "أم"
        elif ups == 2:
            return "جد" if is_male else "جدة"
        elif ups == 3:
            # Great-grandfather: جد الأب or جد الأم
            if first_up_gender == "male":
                return "جد الأب" if is_male else "جدة الأب"
            else:
                return "جد الأم" if is_male else "جدة الأم"
        elif ups == 4:
            if first_up_gender == "male":
                return "جد جد الأب" if is_male else "جدة جد الأب"
            else:
                return "جد جد الأم" if is_male else "جدة جد الأم"
        elif ups == 5:
            return "جد الجد الأكبر" if is_male else "جدة الجد الكبرى"
        else:
            return f"جد (الجيل {ups})" if is_male else f"جدة (الجيل {ups})"

    # --- DIRECT DESCENDANTS ---
    if ups == 0 and downs > 0:
        if downs == 1:
            return "ابن" if is_male else "بنت"
        elif downs == 2:
            return "حفيد" if is_male else "حفيدة"
        elif downs == 3:
            return "ابن الحفيد" if is_male else "بنت الحفيد"
        elif downs == 4:
            return "حفيد الحفيد" if is_male else "حفيدة الحفيد"
        elif downs == 5:
            return "ابن حفيد الحفيد" if is_male else "بنت حفيد الحفيد"
        else:
            return f"حفيد (الجيل {downs})" if is_male else f"حفيدة (الجيل {downs})"

    # --- SIBLINGS ---
    if ups == 1 and downs == 1:
        return "أخ" if is_male else "أخت"

    # --- UNCLE / AUNT (up 2, down 1) ---
    if ups == 2 and downs == 1:
        if first_up_gender == "male":
            return "عم" if is_male else "عمة"
        else:
            return "خال" if is_male else "خالة"

    # --- NEPHEW / NIECE (up 1, down 2) ---
    if ups == 1 and downs == 2:
        sibling_gender = genders[-2]
        if sibling_gender == "male":
            return "ابن أخ" if is_male else "بنت أخ"
        else:
            return "ابن أخت" if is_male else "بنت أخت"

    # --- FIRST COUSINS (up 2, down 2) ---
    if ups == 2 and downs == 2:
        uncle_aunt_gender = genders[3]  # the uncle/aunt in the path
        if first_up_gender == "male":
            if uncle_aunt_gender == "male":
                return "ابن عم" if is_male else "بنت عم"
            else:
                return "ابن عمة" if is_male else "بنت عمة"
        else:
            if uncle_aunt_gender == "male":
                return "ابن خال" if is_male else "بنت خال"
            else:
                return "ابن خالة" if is_male else "بنت خالة"

    # --- GREAT-UNCLE / GREAT-AUNT (up 3, down 1) ---
    if ups == 3 and downs == 1:
        if first_up_gender == "male":
            return "عم الأب" if is_male else "عمة الأب"
        else:
            return "خال الأم" if is_male else "خالة الأم"

    # --- GREAT-NEPHEW / GREAT-NIECE (up 1, down 3) ---
    if ups == 1 and downs == 3:
        sibling_gender = genders[2]
        if sibling_gender == "male":
            return "حفيد الأخ" if is_male else "حفيدة الأخ"
        else:
            return "حفيد الأخت" if is_male else "حفيدة الأخت"

    # --- GREAT-GREAT-UNCLE/AUNT (up 4, down 1) ---
    if ups == 4 and downs == 1:
        if first_up_gender == "male":
            return "عم الجد" if is_male else "عمة الجد"
        else:
            return "خال الجدة" if is_male else "خالة الجدة"

    # --- GREAT-GREAT-NEPHEW/NIECE (up 1, down 4) ---
    if ups == 1 and downs == 4:
        sibling_gender = genders[2]
        if sibling_gender == "male":
            return "ابن حفيد الأخ" if is_male else "بنت حفيد الأخ"
        else:
            return "ابن حفيد الأخت" if is_male else "بنت حفيد الأخت"

    # --- COUSIN REMOVALS ---
    # Parent's cousin (up 3, down 2)
    if ups == 3 and downs == 2:
        uncle_gender = genders[3]
        if first_up_gender == "male":
            if uncle_gender == "male":
                return "ابن عم الأب" if is_male else "بنت عم الأب"
            else:
                return "ابن عمة الأب" if is_male else "بنت عمة الأب"
        else:
            if uncle_gender == "male":
                return "ابن خال الأم" if is_male else "بنت خال الأم"
            else:
                return "ابن خالة الأم" if is_male else "بنت خالة الأم"

    # Cousin's child (up 2, down 3)
    if ups == 2 and downs == 3:
        uncle_gender = genders[2]
        if first_up_gender == "male":
            return "ابن ابن العم" if is_male else "بنت ابن العم"
        else:
            return "ابن ابن الخال" if is_male else "بنت ابن الخال"

    # Second cousins (up 3, down 3)
    if ups == 3 and downs == 3:
        if first_up_gender == "male":
            return "ابن عم الأب" if is_male else "بنت عم الأب"
        else:
            return "ابن خال الأم" if is_male else "بنت خال الأم"

    # Third cousins and beyond (up 4, down 4)
    if ups == 4 and downs == 4:
        if first_up_gender == "male":
            return "قريب من الدرجة الرابعة (جهة الأب)"
        else:
            return "قريب من الدرجة الرابعة (جهة الأم)"

    # up 4, down 3
    if ups == 4 and downs == 3:
        if first_up_gender == "male":
            return "قريب من جهة الأب"
        else:
            return "قريب من جهة الأم"

    # up 3, down 4
    if ups == 3 and downs == 4:
        if first_up_gender == "male":
            return "قريب من جهة الأب"
        else:
            return "قريب من جهة الأم"

    # up 5, down 1
    if ups == 5 and downs == 1:
        return "عم الجد الأكبر" if is_male else "عمة الجد الأكبر"

    # up 1, down 5
    if ups == 1 and downs == 5:
        return "حفيد حفيد الأخ" if is_male else "حفيدة حفيد الأخ"

    # up 5, down 5
    if ups == 5 and downs == 5:
        return "قريب من الدرجة الخامسة"

    # General fallback with direction info
    if ups > 0 and downs > 0:
        side = "جهة الأب" if first_up_gender == "male" else "جهة الأم"
        return f"قريب ({ups} أجيال للأعلى، {downs} للأسفل) من {side}"

    return "قريب"
