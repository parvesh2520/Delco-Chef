import math

EARTH_RADIUS_KM = 6371.0088

# Generous bounding box for India incl. islands (A9: lat/lng must be within India).
INDIA_LAT = (6.5, 37.2)
INDIA_LNG = (68.0, 97.5)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def within_india(lat: float, lng: float) -> bool:
    return INDIA_LAT[0] <= lat <= INDIA_LAT[1] and INDIA_LNG[0] <= lng <= INDIA_LNG[1]


def bounding_box(lat: float, lng: float, radius_km: float) -> tuple[float, float, float, float]:
    """Cheap index-friendly prefilter before the exact haversine check (B7)."""
    dlat = radius_km / 111.32
    dlng = radius_km / (111.32 * max(math.cos(math.radians(lat)), 1e-6))
    return lat - dlat, lat + dlat, lng - dlng, lng + dlng


def eta_minutes(distance_km: float, speed_kmh: float) -> int:
    return max(1, math.ceil(distance_km / max(speed_kmh, 1) * 60))
