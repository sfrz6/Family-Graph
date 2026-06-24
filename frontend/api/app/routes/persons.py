"""
persons.py - API endpoints for managing people and relationships.

CRUD = Create, Read, Update, Delete — the four basic operations for any data.

This file provides endpoints to:
- List all people
- Get one person by ID
- Add a new person (admin only)
- Update a person (admin only)
- Delete a person (admin only)
- Create a relationship between two people (admin only)
- List all relationships
- Delete a relationship (admin only)

Each endpoint is a function decorated with @router.get, @router.post, etc.
FastAPI reads the function parameters and automatically:
- Extracts path parameters (like {person_id} from the URL)
- Parses request bodies (JSON data sent by the frontend)
- Injects dependencies (like the database session)
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Person, Relationship
from ..schemas import (
    PersonCreate, PersonUpdate, PersonResponse,
    RelationshipCreate, RelationshipResponse,
    AddChildCreate, AddSpouseCreate,
)
from ..dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["persons"])


# ========================
#   PERSON ENDPOINTS
# ========================

@router.get("/persons", response_model=List[PersonResponse])
def get_all_persons(db: Session = Depends(get_db), _user: dict = Depends(get_current_user)):
    """
    GET /api/persons
    
    Returns a list of ALL people in the database.
    
    - response_model=List[PersonResponse] tells FastAPI to format the output
      as a list of PersonResponse objects (with id, names, gender, created_at).
    - Depends(get_db) is FastAPI's dependency injection: it automatically
      creates a database session, passes it to this function, and closes
      it when done.
    """
    return db.query(Person).all()


@router.get("/persons/{person_id}", response_model=PersonResponse)
def get_person(person_id: int, db: Session = Depends(get_db), _user: dict = Depends(get_current_user)):
    """
    GET /api/persons/5
    
    Returns one person by their ID.
    {person_id} in the path becomes the function parameter person_id.
    
    If the person doesn't exist, we return 404 (Not Found).
    """
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.post("/persons", response_model=PersonResponse, status_code=201)
def create_person(person: PersonCreate, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    POST /api/persons
    Body: {"name_en": "Ahmed", "name_ar": "أحمد", "gender": "male"}
    
    Creates a new person in the database.
    
    status_code=201 means "Created" — the standard response code when
    a new resource is successfully created.
    
    Steps:
    1. person parameter is automatically parsed from the request body
    2. We create a new Person database object from that data
    3. db.add() stages it for insertion
    4. db.commit() saves it to the database
    5. db.refresh() reloads it from the DB (to get the auto-generated id)
    6. Return the new person with their id
    """
    db_person = Person(
        name_en=person.name_en,
        name_ar=person.name_ar,
        gender=person.gender.value,
    )
    db.add(db_person)
    db.commit()
    db.refresh(db_person)
    return db_person


@router.post("/persons/add-child", status_code=201)
def add_child(data: AddChildCreate, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    POST /api/persons/add-child
    Body: {"child_id": 3, "father_id": 1, "mother_id": 2}
    
    Links an EXISTING child to their parents. All people must already
    exist in the database (created via POST /api/persons).
    
    In one request it:
    1. Links father → child (if father_id provided)
    2. Links mother → child (if mother_id provided)
    3. Links father ↔ mother as spouses (if both provided and not already linked)
    """
    # Validate child exists
    child = db.query(Person).filter(Person.id == data.child_id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    # Validate father exists (if provided)
    if data.father_id:
        father = db.query(Person).filter(Person.id == data.father_id).first()
        if not father:
            raise HTTPException(status_code=404, detail="Father not found")
        if father.gender != "male":
            raise HTTPException(status_code=400, detail="Father must be male")

    # Validate mother exists (if provided)
    if data.mother_id:
        mother = db.query(Person).filter(Person.id == data.mother_id).first()
        if not mother:
            raise HTTPException(status_code=404, detail="Mother not found")
        if mother.gender != "female":
            raise HTTPException(status_code=400, detail="Mother must be female")

    # Step 1: Link father → child (avoid duplicates)
    if data.father_id:
        existing = db.query(Relationship).filter(
            Relationship.person_id == data.father_id,
            Relationship.related_person_id == data.child_id,
            Relationship.relationship_type == "parent_child",
        ).first()
        if not existing:
            db.add(Relationship(
                person_id=data.father_id,
                related_person_id=data.child_id,
                relationship_type="parent_child",
            ))

    # Step 2: Link mother → child (avoid duplicates)
    if data.mother_id:
        existing = db.query(Relationship).filter(
            Relationship.person_id == data.mother_id,
            Relationship.related_person_id == data.child_id,
            Relationship.relationship_type == "parent_child",
        ).first()
        if not existing:
            db.add(Relationship(
                person_id=data.mother_id,
                related_person_id=data.child_id,
                relationship_type="parent_child",
            ))

    # Step 3: Ensure father ↔ mother spouse link exists
    if data.father_id and data.mother_id:
        existing_spouse = db.query(Relationship).filter(
            Relationship.relationship_type == "spouse",
            (
                (Relationship.person_id == data.father_id) &
                (Relationship.related_person_id == data.mother_id)
            ) | (
                (Relationship.person_id == data.mother_id) &
                (Relationship.related_person_id == data.father_id)
            )
        ).first()

        if not existing_spouse:
            db.add(Relationship(
                person_id=data.father_id,
                related_person_id=data.mother_id,
                relationship_type="spouse",
            ))

    db.commit()
    return {"detail": "Child linked to parents successfully"}


@router.post("/persons/add-spouse", status_code=201)
def add_spouse(data: AddSpouseCreate, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    POST /api/persons/add-spouse
    Body: {"person_id": 1, "spouse_id": 2}
    
    Links two existing people as spouses.
    Validates they exist and aren't already linked.
    """
    person = db.query(Person).filter(Person.id == data.person_id).first()
    spouse = db.query(Person).filter(Person.id == data.spouse_id).first()

    if not person or not spouse:
        raise HTTPException(status_code=404, detail="One or both persons not found")

    if data.person_id == data.spouse_id:
        raise HTTPException(status_code=400, detail="Cannot be spouse of oneself")

    # Check for existing spouse link (in either direction)
    existing = db.query(Relationship).filter(
        Relationship.relationship_type == "spouse",
        (
            (Relationship.person_id == data.person_id) &
            (Relationship.related_person_id == data.spouse_id)
        ) | (
            (Relationship.person_id == data.spouse_id) &
            (Relationship.related_person_id == data.person_id)
        )
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Spouse relationship already exists")

    db.add(Relationship(
        person_id=data.person_id,
        related_person_id=data.spouse_id,
        relationship_type="spouse",
    ))
    db.commit()

    return {"detail": "Spouse relationship created"}


@router.put("/persons/{person_id}", response_model=PersonResponse)
def update_person(
    person_id: int,
    person: PersonUpdate,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """
    PUT /api/persons/5
    Body: {"name_en": "Ahmed Al-Said"}  (only fields you want to change)
    
    Updates an existing person.
    
    We use model_dump(exclude_unset=True) to get ONLY the fields the user
    actually sent. If they only sent name_en, we don't touch name_ar or gender.
    setattr() sets the attribute on the database object dynamically.
    """
    db_person = db.query(Person).filter(Person.id == person_id).first()
    if not db_person:
        raise HTTPException(status_code=404, detail="Person not found")

    # Get only the fields that were actually provided in the request
    update_data = person.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        # If the value is an enum (like Gender), get its string value
        if hasattr(value, "value"):
            value = value.value
        setattr(db_person, key, value)

    db.commit()
    db.refresh(db_person)
    return db_person


@router.delete("/persons/{person_id}")
def delete_person(person_id: int, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    DELETE /api/persons/5
    
    Deletes a person AND all their relationships.
    
    Why delete relationships too? Because if person 5 is deleted but a 
    relationship still references person 5, the data becomes inconsistent.
    """
    db_person = db.query(Person).filter(Person.id == person_id).first()
    if not db_person:
        raise HTTPException(status_code=404, detail="Person not found")

    # Delete all relationships involving this person
    db.query(Relationship).filter(
        (Relationship.person_id == person_id)
        | (Relationship.related_person_id == person_id)
    ).delete()

    db.delete(db_person)
    db.commit()
    return {"detail": "Person and related relationships deleted"}


# ========================
#   RELATIONSHIP ENDPOINTS
# ========================

@router.get("/relationships", response_model=List[RelationshipResponse])
def get_all_relationships(db: Session = Depends(get_db), _user: dict = Depends(get_current_user)):
    """
    GET /api/relationships
    
    Returns all relationships in the database.
    Used by the frontend to draw the connections in the graph.
    """
    return db.query(Relationship).all()


@router.post("/relationships", response_model=RelationshipResponse, status_code=201)
def create_relationship(rel: RelationshipCreate, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    POST /api/relationships
    Body: {"person_id": 1, "related_person_id": 2, "relationship_type": "parent_child"}
    
    Creates a connection between two people.
    
    Validations:
    1. Both people must exist in the database
    2. A person can't have a relationship with themselves
    3. The same relationship shouldn't be created twice
    """
    # Check both people exist
    person1 = db.query(Person).filter(Person.id == rel.person_id).first()
    person2 = db.query(Person).filter(Person.id == rel.related_person_id).first()
    if not person1 or not person2:
        raise HTTPException(status_code=404, detail="One or both persons not found")

    # Can't relate to yourself
    if rel.person_id == rel.related_person_id:
        raise HTTPException(status_code=400, detail="Cannot create a relationship with oneself")

    # Check for duplicate relationship
    existing = db.query(Relationship).filter(
        Relationship.person_id == rel.person_id,
        Relationship.related_person_id == rel.related_person_id,
        Relationship.relationship_type == rel.relationship_type.value,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="This relationship already exists")

    db_rel = Relationship(
        person_id=rel.person_id,
        related_person_id=rel.related_person_id,
        relationship_type=rel.relationship_type.value,
    )
    db.add(db_rel)
    db.commit()
    db.refresh(db_rel)
    return db_rel


@router.delete("/relationships/{relationship_id}")
def delete_relationship(relationship_id: int, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """
    DELETE /api/relationships/3
    
    Removes a relationship between two people.
    The people themselves are NOT deleted — just the connection.
    """
    db_rel = db.query(Relationship).filter(Relationship.id == relationship_id).first()
    if not db_rel:
        raise HTTPException(status_code=404, detail="Relationship not found")

    db.delete(db_rel)
    db.commit()
    return {"detail": "Relationship deleted"}
