"""
relationship.py - Relationship finder API endpoint.

This provides a single endpoint that takes two person IDs
and returns how they are related, with the relationship
described in both English and Arabic.

Example:
  POST /api/relationship/find
  Body: {"person_id_1": 1, "person_id_2": 5}
  
  Response: {
    "path": [1, 3, 7, 5],
    "relationship_en": "cousin",
    "relationship_ar": "ابن عم",
    "description_en": "Omar is Ahmed's cousin",
    "description_ar": "عمر هو ابن عم أحمد"
  }
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..relationship_finder import get_relationship
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/relationship", tags=["relationship"])


class RelationshipFindRequest(BaseModel):
    """Two person IDs to find the relationship between."""
    person_id_1: int
    person_id_2: int


class RelationshipFindResponse(BaseModel):
    """The result of a relationship search."""
    path: List[int]
    relationship_en: str
    relationship_ar: str
    description_en: str
    description_ar: str
    steps: List[str]


@router.post("/find", response_model=RelationshipFindResponse)
def find_relationship(
    request: RelationshipFindRequest,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    POST /api/relationship/find
    
    Finds how two people are related.
    Returns the path between them, the relationship term in
    both English and Arabic, and a human-readable description.
    """
    if request.person_id_1 == request.person_id_2:
        raise HTTPException(status_code=400, detail="Cannot find relationship with oneself")

    result = get_relationship(request.person_id_1, request.person_id_2, db)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="One or both persons not found, or no connection exists"
        )

    if not result["path"]:
        raise HTTPException(
            status_code=404,
            detail="No connection found between these two people"
        )

    return result
