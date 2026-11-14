"""visit ratings

Revision ID: a7c3e91b2d40
Revises: e66cdf57002d
Create Date: 2026-11-14 12:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7c3e91b2d40'
down_revision = 'e66cdf57002d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('visit_ratings',
    sa.Column('visit_id', sa.BigInteger(), nullable=False),
    sa.Column('customer_id', sa.BigInteger(), nullable=False),
    sa.Column('chef_id', sa.BigInteger(), nullable=False),
    sa.Column('stars', sa.SmallInteger(), nullable=False),
    sa.Column('comment', sa.String(length=300), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('stars between 1 and 5', name=op.f('ck_visit_ratings_stars')),
    sa.ForeignKeyConstraint(['chef_id'], ['chefs.id'], name=op.f('fk_visit_ratings_chef_id_chefs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['customer_id'], ['users.id'], name=op.f('fk_visit_ratings_customer_id_users'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['visit_id'], ['visits.id'], name=op.f('fk_visit_ratings_visit_id_visits'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('visit_id', name=op.f('pk_visit_ratings'))
    )
    op.create_index(op.f('ix_visit_ratings_chef_id'), 'visit_ratings', ['chef_id'], unique=False)
    op.create_index(op.f('ix_visit_ratings_customer_id'), 'visit_ratings', ['customer_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_visit_ratings_customer_id'), table_name='visit_ratings')
    op.drop_index(op.f('ix_visit_ratings_chef_id'), table_name='visit_ratings')
    op.drop_table('visit_ratings')
