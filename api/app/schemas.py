"""
schemas.py - API data validation and serialization.

Models (models.py) define how data is STORED in the database.
Schemas (this file) define how data is SENT and RECEIVED through the API.

Why separate? Because what you store and what you expose are often different.
For example:
- When creating a person, the user sends name and gender (PersonCreate).
- The database adds an id and timestamp automatically.
- When returning a person, we include the id and timestamp (PersonResponse).

Pydantic checks every incoming request against these schemas.
If someone sends gender="helicopter", Pydantic rejects it before
your code even sees it.
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


# --- Enums ---
# Enums restrict a field to specific allowed values.

class Gender(str, Enum):
    """Only these two values are accepted for gender."""
    male = "male"
    female = "female"


class RelationshipType(str, Enum):
    """Only these two relationship types are stored."""
    parent_child = "parent_child"
    spouse = "spouse"


class ContributionStatus(str, Enum):
    """Status of a user's contribution."""
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


# --- Person Schemas ---

class PersonCreate(BaseModel):
    """
    What the API expects when someone wants to ADD a new person.
    Only the essential fields — id and timestamps are generated automatically.
    """
    name_en: str
    name_ar: str
    gender: Gender


class PersonUpdate(BaseModel):
    """
    What the API expects when someone wants to EDIT a person.
    All fields are Optional — you only send what you want to change.
    """
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
    gender: Optional[Gender] = None


class PersonResponse(BaseModel):
    """
    What the API RETURNS when you ask for a person.
    Includes everything: the auto-generated id and timestamp too.
    
    model_config with from_attributes=True tells Pydantic to read data
    from SQLAlchemy model objects, not just dictionaries.
    """
    id: int
    name_en: str
    name_ar: str
    gender: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Relationship Schemas ---

class RelationshipCreate(BaseModel):
    """
    What the API expects when creating a relationship.
    
    For parent_child: person_id = parent, related_person_id = child
    For spouse: order doesn't matter
    """
    person_id: int
    related_person_id: int
    relationship_type: RelationshipType


class RelationshipResponse(BaseModel):
    """What the API returns for a relationship."""
    id: int
    person_id: int
    related_person_id: int
    relationship_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Convenience Schemas ---
# These simplify common operations by bundling multiple steps into one.

class AddChildCreate(BaseModel):
    """
    Link an existing child to their parents.
    
    All three people must already exist in the database (created via POST /api/persons).
    
    The backend will:
    1. Create parent_child link: father → child (if father_id provided)
    2. Create parent_child link: mother → child (if mother_id provided)
    3. Create spouse link between father and mother (if both provided and not already linked)
    
    father_id and mother_id are Optional because:
    - The oldest generation has no parents in the system
    - Some people may only have one known parent
    """
    child_id: int
    father_id: Optional[int] = None
    mother_id: Optional[int] = None


class AddSpouseCreate(BaseModel):
    """
    Link two existing people as spouses.
    The backend validates genders and checks for duplicates.
    """
    person_id: int
    spouse_id: int


# --- Contribution Schemas ---

class ContributionCreate(BaseModel):
    """What a normal user submits as a suggestion."""
    contribution_type: str
    data: str  # JSON string with the details


class ContributionResponse(BaseModel):
    """What the API returns for a contribution."""
    id: int
    contribution_type: str
    data: str
    status: str
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Auth Schema ---

class AuthRequest(BaseModel):
    """
    Login request — just a secret code.
    The backend checks if it matches the user code or admin code.
    """
    secret_code: str
