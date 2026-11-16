"""otp challenge provider reference (Message Central verificationId)

Revision ID: b4d2f8a1c6e3
Revises: a7c3e91b2d40
Create Date: 2026-11-17 12:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = 'b4d2f8a1c6e3'
down_revision = 'a7c3e91b2d40'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('otp_challenges', sa.Column('provider_ref', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('otp_challenges', 'provider_ref')
