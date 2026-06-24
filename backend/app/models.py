"""
models.py - Database table definitions.

This is where we define WHAT data we store and HOW it's structured.
Each class = one table in the database.
Each attribute = one column in that table.

We have three tables:
1. Person — stores family members
2. Relationship — stores connections between people
3. PendingContribution — stores user suggestions waiting for admin approval
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func

from .database import Base


class Person(Base):
    """
    The Person table stores every family member.
    
    Each person has:
    - id: A unique number assigned automatically (primary key)
    - name_en: Their name in English
    - name_ar: Their name in Arabic
    - gender: Either "male" or "female"
    - created_at: When this record was added (set automatically)
    """
    __tablename__ = "persons"  # This is the actual table name in SQLite

    id = Column(Integer, primary_key=True, index=True)
    name_en = Column(String, nullable=False)       # English name — required
    name_ar = Column(String, nullable=False)       # Arabic name — required
    gender = Column(String, nullable=False)         # "male" or "female"
    created_at = Column(DateTime, server_default=func.now())


class Relationship(Base):
    """
    The Relationship table stores connections between two people.
    
    We only store TWO types of relationships:
    - "parent_child" → person_id is the PARENT, related_person_id is the CHILD
    - "spouse" → person_id and related_person_id are married
    
    Why not store siblings? Because siblings are DERIVED — if two people share 
    the same parent, they're siblings. Storing it explicitly would mean we'd have 
    to keep it in sync manually, which leads to bugs.
    
    ForeignKey means this column references the 'id' column in the persons table.
    This ensures you can't create a relationship with a person that doesn't exist.
    """
    __tablename__ = "relationships"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("persons.id"), nullable=False)
    related_person_id = Column(Integer, ForeignKey("persons.id"), nullable=False)
    relationship_type = Column(String, nullable=False)  # "parent_child" or "spouse"
    created_at = Column(DateTime, server_default=func.now())


class PendingContribution(Base):
    """
    When a normal user wants to add someone or suggest a correction,
    it goes into this table instead of directly into the main tables.
    
    The admin reviews it and either approves or rejects it.
    
    - contribution_type: What the user wants to do — "add_person", "add_relationship"
    - data: The actual content of the suggestion, stored as a JSON string
            Example: '{"name_en": "Ahmed", "name_ar": "أحمد", "gender": "male"}'
    - status: "pending" (waiting), "approved", or "rejected"
    - submitted_at: When the user submitted it
    - reviewed_at: When the admin made a decision (null until reviewed)
    """
    __tablename__ = "pending_contributions"

    id = Column(Integer, primary_key=True, index=True)
    contribution_type = Column(String, nullable=False)
    data = Column(String, nullable=False)  # JSON string
    status = Column(String, default="pending")
    submitted_at = Column(DateTime, server_default=func.now())
    reviewed_at = Column(DateTime, nullable=True)
