from fastapi import APIRouter

from app.api.v1.endpoints import admin, auth, chefs, customers, health, payments, visits

api_router = APIRouter()
for r in (health.router, auth.router, customers.router, visits.router, payments.router, chefs.router, chefs.notifications,
          admin.router):
    api_router.include_router(r)
