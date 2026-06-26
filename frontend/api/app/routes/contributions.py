"""
contributions.py - Contribution and admin management endpoints.

Normal users can submit suggestions (add a person, add a relationship).
Admins can view pending contributions and approve or reject them.
Also provides admin statistics about the family graph.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import json
from datetime import datetime

from ..database import get_db
from ..models import Person, Relationship, PendingContribution
from ..schemas import ContributionCreate, ContributionResponse
from ..dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["contributions"])


# ========================
#   ADMIN STATISTICS
# ========================

@router.get("/admin/stats")
def get_stats(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    GET /api/admin/stats
    
    Returns statistics about the family graph for the admin dashboard.
    """
    total_persons = db.query(Person).count()
    total_males = db.query(Person).filter(Person.gender == "male").count()
    total_females = db.query(Person).filter(Person.gender == "female").count()
    total_relationships = db.query(Relationship).count()
    total_parent_child = db.query(Relationship).filter(
        Relationship.relationship_type == "parent_child"
    ).count()
    total_spouse = db.query(Relationship).filter(
        Relationship.relationship_type == "spouse"
    ).count()
    pending_contributions = db.query(PendingContribution).filter(
        PendingContribution.status == "pending"
    ).count()
    approved_contributions = db.query(PendingContribution).filter(
        PendingContribution.status == "approved"
    ).count()
    rejected_contributions = db.query(PendingContribution).filter(
        PendingContribution.status == "rejected"
    ).count()

    # Calculate generations (find max depth)
    # Find people with no parents (roots)
    all_rels = db.query(Relationship).filter(
        Relationship.relationship_type == "parent_child"
    ).all()
    
    children_of = {}
    parents_of = {}
    for p in db.query(Person).all():
        children_of[p.id] = []
        parents_of[p.id] = []
    
    for r in all_rels:
        children_of[r.person_id].append(r.related_person_id)
        parents_of[r.related_person_id].append(r.person_id)
    
    roots = [pid for pid, pars in parents_of.items() if len(pars) == 0]
    
    max_depth = 0
    queue = [(r, 1) for r in roots]
    visited = set()
    while queue:
        pid, depth = queue.pop(0)
        if pid in visited:
            continue
        visited.add(pid)
        if depth > max_depth:
            max_depth = depth
        for child_id in children_of.get(pid, []):
            queue.append((child_id, depth + 1))

    return {
        "total_persons": total_persons,
        "total_males": total_males,
        "total_females": total_females,
        "total_relationships": total_relationships,
        "total_parent_child": total_parent_child,
        "total_spouse": total_spouse,
        "total_generations": max_depth,
        "pending_contributions": pending_contributions,
        "approved_contributions": approved_contributions,
        "rejected_contributions": rejected_contributions,
    }


# ========================
#   PERSON MISSING RELATIVES
# ========================

@router.get("/persons/{person_id}/missing-relatives")
def get_missing_relatives(person_id: int, db: Session = Depends(get_db), _user: dict = Depends(get_current_user)):
    """
    GET /api/persons/5/missing-relatives
    
    Returns which relative types are missing for this person.
    Used by the UI to show which "Add" buttons to enable.
    
    For example, if person has no mother linked, returns "mother" in the list.
    """
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    rels = db.query(Relationship).filter(
        (Relationship.person_id == person_id) |
        (Relationship.related_person_id == person_id)
    ).all()

    # Check what exists
    has_father = False
    has_mother = False

    for r in rels:
        if r.relationship_type == "parent_child" and r.related_person_id == person_id:
            # This person is a child — r.person_id is a parent
            parent = db.query(Person).filter(Person.id == r.person_id).first()
            if parent:
                if parent.gender == "male":
                    has_father = True
                else:
                    has_mother = True

    missing = []
    if not has_father:
        missing.append("father")
    if not has_mother:
        missing.append("mother")
    # Spouse, children, and siblings can always be added (no limit -
    # a person can have more than one spouse).
    missing.append("spouse")
    missing.append("child")
    missing.append("sibling")

    return {"person_id": person_id, "missing": missing}


# ========================
#   CONTRIBUTIONS (User Suggestions)
# ========================

@router.post("/contributions", response_model=ContributionResponse, status_code=201)
def submit_contribution(
    contribution: ContributionCreate,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    POST /api/contributions
    
    Normal user submits a suggestion.
    The 'data' field is a JSON string containing the details.
    
    Examples:
    - Add person: {"contribution_type": "add_person", "data": "{\"name_en\": \"Ali\", ...}"}
    - Add relative: {"contribution_type": "add_relative", "data": "{\"person_id\": 5, \"relative_type\": \"mother\", ...}"}
    """
    db_contribution = PendingContribution(
        contribution_type=contribution.contribution_type,
        data=contribution.data,
        status="pending",
    )
    db.add(db_contribution)
    db.commit()
    db.refresh(db_contribution)
    return db_contribution


@router.get("/contributions", response_model=List[ContributionResponse])
def get_contributions(status: str = None, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    GET /api/contributions?status=pending
    
    Returns contributions, optionally filtered by status.
    """
    query = db.query(PendingContribution)
    if status:
        query = query.filter(PendingContribution.status == status)
    return query.order_by(PendingContribution.submitted_at.desc()).all()


@router.put("/contributions/{contribution_id}/approve")
def approve_contribution(contribution_id: int, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    PUT /api/contributions/5/approve
    
    Admin approves a contribution. This processes the suggestion
    and adds the data to the main tables.
    """
    contribution = db.query(PendingContribution).filter(
        PendingContribution.id == contribution_id
    ).first()
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    if contribution.status != "pending":
        raise HTTPException(status_code=400, detail="Contribution already reviewed")

    # Parse the contribution data
    try:
        data = json.loads(contribution.data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid contribution data")

    # Process based on type
    if contribution.contribution_type == "add_person":
        person = Person(
            name_en=data["name_en"],
            name_ar=data["name_ar"],
            gender=data["gender"],
        )
        db.add(person)
        db.flush()  # Get the ID without committing

        # If parent info is included, create relationships
        if data.get("father_id"):
            db.add(Relationship(
                person_id=data["father_id"],
                related_person_id=person.id,
                relationship_type="parent_child",
            ))
        if data.get("mother_id"):
            db.add(Relationship(
                person_id=data["mother_id"],
                related_person_id=person.id,
                relationship_type="parent_child",
            ))
        # Auto-create spouse link between parents
        if data.get("father_id") and data.get("mother_id"):
            existing = db.query(Relationship).filter(
                Relationship.relationship_type == "spouse",
                (
                    (Relationship.person_id == data["father_id"]) &
                    (Relationship.related_person_id == data["mother_id"])
                ) | (
                    (Relationship.person_id == data["mother_id"]) &
                    (Relationship.related_person_id == data["father_id"])
                )
            ).first()
            if not existing:
                db.add(Relationship(
                    person_id=data["father_id"],
                    related_person_id=data["mother_id"],
                    relationship_type="spouse",
                ))

    elif contribution.contribution_type == "add_relative":
        # Adding a relative to an existing person
        person_id = data["person_id"]
        relative_type = data["relative_type"]

        # Create the new person
        new_person = Person(
            name_en=data["name_en"],
            name_ar=data["name_ar"],
            gender=data["gender"],
        )
        db.add(new_person)
        db.flush()

        # Create the relationship based on type
        if relative_type == "father":
            db.add(Relationship(
                person_id=new_person.id,
                related_person_id=person_id,
                relationship_type="parent_child",
            ))
        elif relative_type == "mother":
            db.add(Relationship(
                person_id=new_person.id,
                related_person_id=person_id,
                relationship_type="parent_child",
            ))
        elif relative_type == "child":
            db.add(Relationship(
                person_id=person_id,
                related_person_id=new_person.id,
                relationship_type="parent_child",
            ))
            # If person has a spouse, also link child to spouse
            spouse_rel = db.query(Relationship).filter(
                Relationship.relationship_type == "spouse",
                (Relationship.person_id == person_id) |
                (Relationship.related_person_id == person_id)
            ).first()
            if spouse_rel:
                spouse_id = spouse_rel.related_person_id if spouse_rel.person_id == person_id else spouse_rel.person_id
                db.add(Relationship(
                    person_id=spouse_id,
                    related_person_id=new_person.id,
                    relationship_type="parent_child",
                ))
        elif relative_type == "spouse":
            db.add(Relationship(
                person_id=person_id,
                related_person_id=new_person.id,
                relationship_type="spouse",
            ))
        elif relative_type == "sibling":
            # Find shared parents and link the new person to them
            parent_rels = db.query(Relationship).filter(
                Relationship.relationship_type == "parent_child",
                Relationship.related_person_id == person_id,
            ).all()
            for pr in parent_rels:
                db.add(Relationship(
                    person_id=pr.person_id,
                    related_person_id=new_person.id,
                    relationship_type="parent_child",
                ))

    elif contribution.contribution_type == "mark_deceased":
        person = db.query(Person).filter(Person.id == data["person_id"]).first()
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        person.is_deceased = True

    contribution.status = "approved"
    contribution.reviewed_at = datetime.utcnow()
    db.commit()
    return {"detail": "Contribution approved and applied"}


@router.put("/contributions/{contribution_id}/reject")
def reject_contribution(contribution_id: int, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    PUT /api/contributions/5/reject
    
    Admin rejects a contribution. Data is NOT applied.
    """
    contribution = db.query(PendingContribution).filter(
        PendingContribution.id == contribution_id
    ).first()
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    if contribution.status != "pending":
        raise HTTPException(status_code=400, detail="Contribution already reviewed")

    contribution.status = "rejected"
    contribution.reviewed_at = datetime.utcnow()
    db.commit()
    return {"detail": "Contribution rejected"}
