from app.schemas.base import CamelModel


class College(CamelModel):
    id: str
    name: str
    short_name: str
    city: str
    state: str
    domain: str | None = None
    status: str = "verified"
    campus_spots: list[str] = []
    popular_branches: list[str] = []
    is_verified: bool = True


class CollegeRequest(CamelModel):
    name: str
    city: str
    state: str = "India"
    domain: str | None = None


class CollegeRequestResponse(CamelModel):
    success: bool = True
    message: str
    college: College | None = None
