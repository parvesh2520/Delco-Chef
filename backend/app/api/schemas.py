"""Request bodies. Business validation (with specific error codes) lives in the services; these define the contract
for OpenAPI and reject malformed shapes early."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class In(BaseModel):
    model_config = ConfigDict(extra="ignore")


Portal = Literal["customer", "chef", "admin"]


class OtpRequest(In):
    phone: str = Field(examples=["9876543210"])
    portal: Portal


class OtpVerify(In):
    phone: str
    code: str = Field(min_length=1, max_length=6)
    portal: Portal
    device: str | None = Field(default=None, max_length=120)


class RefreshIn(In):
    refreshToken: str


class LogoutIn(In):
    refreshToken: str | None = None


class ProfileIn(In):
    fullName: str | None = None
    email: str | None = None
    householdSize: int | None = None
    preferredLanguage: str | None = None
    diet: str | None = None
    allergies: list[str] | None = None
    allergyNotes: str | None = None


class ConsentIn(In):
    kinds: list[Literal["terms", "location"]] = ["terms", "location"]


class AddressIn(In):
    label: str = "Home"
    line1: str
    line2: str | None = None
    landmark: str | None = None
    city: str
    pincode: str
    lat: float
    lng: float
    isDefault: bool = False


class RequestIn(In):
    service: str
    intent: Literal["trial", "subscribe"] = "trial"
    members: int
    slot: str
    startDate: str
    endDate: str | None = None
    durationDays: int | None = None
    weekdays: list[int] = []
    meals: list[str] = []
    cuisines: list[str] = []
    diet: str
    dietaryNotes: str | None = Field(default=None, max_length=300)
    hasAllergies: bool | None = None
    allergies: list[str] = []
    allergyNotes: str | None = Field(default=None, max_length=500)
    instructions: str | None = None
    addressId: str
    amount: float | None = Field(default=None, description="Ignored. Prices are always calculated on the server.")


class DecisionIn(In):
    decision: Literal["subscribe", "another_trial", "reject"] | str
    startDate: str | None = None


class DaysIn(In):
    days: list[str]


class ReasonIn(In):
    reason: str | None = Field(default=None, max_length=300)


class RevealIn(In):
    """H6: every reveal records why it was needed."""
    reason: str = Field(min_length=3, max_length=300)


class RespondIn(In):
    accept: bool
    reason: str | None = Field(default=None, max_length=300)


class PositionIn(In):
    lat: float | None = None
    lng: float | None = None
    accuracy: float | None = None
    deviceId: str | None = None


class CheckInIn(PositionIn):
    code: str = ""
    selfiePhotoId: str | None = None


class CheckOutIn(PositionIn):
    selfiePhotoId: str | None = None
    foodPhotoId: str | None = None


class CodeIn(In):
    code: str


class UnavailableIn(PositionIn):
    note: str | None = Field(default=None, max_length=300)


class PointIn(In):
    lat: float
    lng: float
    accuracy: float | None = None
    recordedAt: str | None = None


class PointsIn(In):
    points: list[PointIn] = Field(min_length=1, max_length=120)


class CallbackIn(In):
    linkId: str
    referenceId: str
    status: str
    paymentRef: str
    signature: str


class BankIn(In):
    accountName: str
    accountNumber: str
    ifsc: str
    upi: str | None = None


class ChefApplicationIn(In):
    fullName: str
    email: str | None = None
    city: str
    area: str
    homeLat: float
    homeLng: float
    experienceYears: int | str
    cuisines: list[str]
    specialities: str | None = None
    idNumber: str
    taxNumber: str
    bank: BankIn


class ChefPatchIn(In):
    name: str | None = None
    email: str | None = None
    city: str | None = None
    area: str | None = None
    specialities: str | None = None
    active: bool | None = None


class AssignIn(In):
    chefId: str
    reason: str | None = Field(default=None, max_length=300)
    visitId: str | None = None


class PushTrialIn(In):
    chefId: str
    date: str


class MoveIn(In):
    to: str
    note: str | None = Field(default=None, max_length=300)


class ResolveIn(In):
    resolution: str = Field(max_length=300)
    workedMinutes: int | None = None
    decision: Literal["approve", "reject"] = "approve"


class SettingsIn(In):
    values: dict[str, str | int | float]


class AdminIn(In):
    name: str
    phone: str
    email: str
    role: Literal["ops_admin", "super_admin"]


class ActiveIn(In):
    active: bool


class ChefDecisionIn(In):
    approve: bool
    reason: str | None = Field(default=None, max_length=500)


class PayoutDecisionIn(In):
    approve: bool = True
    bankReference: str | None = None


class AdjustIn(In):
    amountPaise: int
    reason: str


class RatingIn(In):
    stars: int = Field(ge=1, le=5)
    comment: str | None = Field(None, max_length=300)
