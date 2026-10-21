"""Add the OLX browsing core: locations, categories, attributes and geo.

Creates the place tree (`locations`), the category tree (`categories` with
`category_attributes`), the filterable listing attributes
(`listing_attributes`) and the campus landmarks (`pickup_spots`), then moves
`colleges`, `listings` and `users` onto them.

This is a clean break: the old rows cannot be backfilled (a college becomes a
row in the place tree, and a listing needs a category, a place and a point),
so every table is truncated as part of the migration.

Revision ID: c3f8a91d24b7
Revises: b735b2310805
Create Date: 2026-10-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import pgvector.sqlalchemy
from sqlalchemy.dialects import postgresql

revision: str = "c3f8a91d24b7"
down_revision: Union[str, None] = "b735b2310805"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES_TO_WIPE = (
    "listing_attributes",
    "pickup_spots",
    "category_attributes",
    "categories",
    "locations",
    "wishlists",
    "trades",
    "messages",
    "conversations",
    "notifications",
    "listing_images",
    "listings",
    "otp_codes",
    "refresh_tokens",
    "users",
    "colleges",
)


def upgrade() -> None:
    # ---------------------------------------------------------------- places
    op.create_table(
        "locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ancestors", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("address_line", sa.Text(), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_locations")),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["locations.id"], name=op.f("fk_locations_parent_id_locations"), ondelete="CASCADE"
        ),
        sa.UniqueConstraint("slug", name=op.f("uq_locations_slug")),
        sa.CheckConstraint(
            "type IN ('country','state','city','district','campus')",
            name="ck_locations_type",
        ),
    )
    op.create_index(op.f("ix_locations_slug"), "locations", ["slug"], unique=False)
    op.create_index(op.f("ix_locations_type"), "locations", ["type"], unique=False)
    op.create_index(op.f("ix_locations_parent_id"), "locations", ["parent_id"], unique=False)
    op.create_index(
        "ix_locations_ancestors", "locations", ["ancestors"], unique=False, postgresql_using="gin"
    )
    op.create_index(
        "ix_locations_geo", "locations", ["latitude", "longitude"], unique=False
    )

    # ------------------------------------------------------------ categories
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("alias", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ancestors", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("path", sa.String(length=320), nullable=False, server_default=""),
        sa.Column("view_type", sa.String(length=16), nullable=False, server_default="list"),
        sa.Column("photos_max", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["categories.id"], name=op.f("fk_categories_parent_id_categories"), ondelete="CASCADE"
        ),
        sa.UniqueConstraint("slug", name=op.f("uq_categories_slug")),
    )
    op.create_index(op.f("ix_categories_slug"), "categories", ["slug"], unique=False)
    op.create_index(op.f("ix_categories_parent_id"), "categories", ["parent_id"], unique=False)
    op.create_index(
        "ix_categories_ancestors", "categories", ["ancestors"], unique=False, postgresql_using="gin"
    )

    op.create_table(
        "category_attributes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("data_type", sa.String(length=16), nullable=False, server_default="text"),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("min_value", sa.Numeric(18, 4), nullable=True),
        sa.Column("max_value", sa.Numeric(18, 4), nullable=True),
        sa.Column("unit", sa.String(length=24), nullable=True),
        sa.Column("is_filterable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_category_attributes")),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_category_attributes_category_id_categories"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("category_id", "key", name="category_attribute_key"),
    )
    op.create_index(
        op.f("ix_category_attributes_category_id"), "category_attributes", ["category_id"], unique=False
    )

    # ---------------------------------------------------------- pickup spots
    op.create_table(
        "pickup_spots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("college_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pickup_spots")),
        sa.ForeignKeyConstraint(
            ["college_id"],
            ["colleges.id"],
            name=op.f("fk_pickup_spots_college_id_colleges"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("college_id", "name", name="uq_pickup_spots_college_id_name"),
    )
    op.create_index(
        op.f("ix_pickup_spots_college_id"), "pickup_spots", ["college_id"], unique=False
    )
    op.create_index(
        "ix_pickup_spots_geo", "pickup_spots", ["latitude", "longitude"], unique=False
    )

    # ------------------------------------------------------ listing attrs
    op.create_table(
        "listing_attributes",
        sa.Column("listing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("value_num", sa.Numeric(18, 4), nullable=True),
        sa.Column("value_bool", sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint("listing_id", "key", name="pk_listing_attributes"),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_listing_attributes_category_id_categories"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name=op.f("fk_listing_attributes_listing_id_listings"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_listing_attributes_listing_id"), "listing_attributes", ["listing_id"], unique=False
    )
    op.create_index(
        op.f("ix_listing_attributes_category_id"), "listing_attributes", ["category_id"], unique=False
    )
    op.create_index(
        "ix_listing_attributes_num",
        "listing_attributes",
        ["key", "value_num"],
        unique=False,
        postgresql_where=sa.text("value_num IS NOT NULL"),
    )
    op.create_index(
        "ix_listing_attributes_bool",
        "listing_attributes",
        ["key", "value_bool"],
        unique=False,
        postgresql_where=sa.text("value_bool IS NOT NULL"),
    )

    # ------------------------------------------------------ new columns
    op.add_column("colleges", sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("listings", sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("listings", sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("listings", sa.Column("pickup_spot_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("listings", sa.Column("latitude", sa.Numeric(9, 6), nullable=True))
    op.add_column("listings", sa.Column("longitude", sa.Numeric(9, 6), nullable=True))
    op.add_column("users", sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True))

    # ------------------------------------------------------ clean break
    op.execute(
        "TRUNCATE "
        + ", ".join(TABLES_TO_WIPE)
        + " RESTART IDENTITY CASCADE"
    )

    op.drop_column("colleges", "name")
    op.drop_column("colleges", "city")
    op.drop_column("colleges", "state")
    op.drop_column("colleges", "campus_spots")

    # ------------------------------------------------------ constraints
    op.alter_column("colleges", "location_id", nullable=False)
    op.create_foreign_key(
        "fk_colleges_location_id_locations", "colleges", "locations", ["location_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_unique_constraint("uq_colleges_location_id", "colleges", ["location_id"])
    op.create_index(op.f("ix_colleges_location_id"), "colleges", ["location_id"], unique=False)

    op.create_foreign_key(
        "fk_listings_category_id_categories", "listings", "categories", ["category_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_listings_location_id_locations", "listings", "locations", ["location_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_listings_pickup_spot_id_pickup_spots", "listings", "pickup_spots", ["pickup_spot_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index(op.f("ix_listings_category_id"), "listings", ["category_id"], unique=False)
    op.create_index(op.f("ix_listings_location_id"), "listings", ["location_id"], unique=False)
    op.create_index(op.f("ix_listings_pickup_spot_id"), "listings", ["pickup_spot_id"], unique=False)
    op.create_index("ix_listings_geo", "listings", ["latitude", "longitude"], unique=False)

    op.create_foreign_key(
        "fk_users_location_id_locations", "users", "locations", ["location_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index(op.f("ix_users_location_id"), "users", ["location_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_location_id"), table_name="users")
    op.drop_constraint("fk_users_location_id_locations", "users", type_="foreignkey")

    op.drop_index("ix_listings_geo", table_name="listings")
    op.drop_index(op.f("ix_listings_pickup_spot_id"), table_name="listings")
    op.drop_index(op.f("ix_listings_location_id"), table_name="listings")
    op.drop_index(op.f("ix_listings_category_id"), table_name="listings")
    op.drop_constraint("fk_listings_pickup_spot_id_pickup_spots", "listings", type_="foreignkey")
    op.drop_constraint("fk_listings_location_id_locations", "listings", type_="foreignkey")
    op.drop_constraint("fk_listings_category_id_categories", "listings", type_="foreignkey")

    op.drop_index(op.f("ix_colleges_location_id"), table_name="colleges")
    op.drop_constraint("uq_colleges_location_id", "colleges", type_="unique")
    op.drop_constraint("fk_colleges_location_id_locations", "colleges", type_="foreignkey")
    op.alter_column("colleges", "location_id", nullable=True)
    op.add_column("colleges", sa.Column("name", sa.String(length=255), nullable=False, server_default=""))
    op.add_column("colleges", sa.Column("city", sa.String(length=128), nullable=False, server_default=""))
    op.add_column("colleges", sa.Column("state", sa.String(length=128), nullable=False, server_default=""))
    op.add_column(
        "colleges",
        sa.Column("campus_spots", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
    )

    op.drop_column("users", "location_id")
    op.drop_column("listings", "longitude")
    op.drop_column("listings", "latitude")
    op.drop_column("listings", "pickup_spot_id")
    op.drop_column("listings", "location_id")
    op.drop_column("listings", "category_id")
    op.drop_column("colleges", "location_id")

    op.drop_table("listing_attributes")
    op.drop_table("pickup_spots")
    op.drop_table("category_attributes")
    op.drop_table("categories")
    op.drop_table("locations")
