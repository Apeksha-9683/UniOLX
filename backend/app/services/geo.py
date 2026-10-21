"""Distance filtering and sorting, without a PostGIS dependency.

The radius filter uses a bounding box first so the `(latitude, longitude)`
index can be used, then the exact haversine distance to trim the edges.
"""

import math

from sqlalchemy import literal_column
from sqlalchemy.sql.elements import ColumnElement

EARTH_RADIUS_KM = 6371.0
KM_PER_DEGREE = 111.32


def haversine_expr(
    lat_column: str, lng_column: str, center_lat: float, center_lng: float
) -> ColumnElement:
    """Haversine distance in kilometres as a SQL expression.

    The centre is inlined as a float literal: the values come from typed
    query parameters, and inlining keeps the expression comparable, which a
    `text()` fragment is not.
    """
    lat = float(center_lat)
    lng = float(center_lng)
    return literal_column(
        f"""
        {EARTH_RADIUS_KM} * acos(least(1, greatest(-1,
            cos(radians({lat})) * cos(radians({lat_column}))
              * cos(radians({lng_column}) - radians({lng}))
            + sin(radians({lat})) * sin(radians({lat_column}))
        )))
        """
    )


def bounding_box(
    center_lat: float, center_lng: float, radius_km: float
) -> tuple[float, float, float, float]:
    """The lat/lng box that fully contains the radius.

    The longitude span shrinks towards the poles, which is the part that is
    easy to get wrong and silently drops valid results.
    """
    lat_delta = radius_km / KM_PER_DEGREE
    cos_lat = math.cos(math.radians(center_lat))
    if abs(cos_lat) < 1e-6:
        lng_delta = 180.0
    else:
        lng_delta = min(180.0, radius_km / (KM_PER_DEGREE * abs(cos_lat)))

    return (
        center_lat - lat_delta,
        center_lat + lat_delta,
        center_lng - lng_delta,
        center_lng + lng_delta,
    )


def apply_radius(
    stmt, lat_column, lng_column, center_lat: float, center_lng: float, radius_km: float
):
    """Restrict a statement to a radius, using the index-friendly box first."""
    min_lat, max_lat, min_lng, max_lng = bounding_box(center_lat, center_lng, radius_km)
    return (
        stmt.where(lat_column.between(min_lat, max_lat))
        .where(lng_column.between(min_lng, max_lng))
    )
