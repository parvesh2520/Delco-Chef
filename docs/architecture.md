# Delco Chefs - System Architecture Documentation

## 1. Overview

**Delco Chefs** is a genuine native Android on-demand home chef mobile application backed by a modular Python FastAPI service and a PostgreSQL database.

This document describes the foundational architecture, folder organization, state and data flow, and deployment pipelines established for the project.

---

## 2. Technology Stack

### Mobile Client (Native Android)
- **Framework:** React Native with Expo (SDK 58)
- **Language:** TypeScript (`strict: true`)
- **Navigation:** Expo Router (File-based routing with route groups)
- **Styling:** React Native `StyleSheet` with centralized token-based theme
- **Client State:** Zustand (lightweight store for authentication, user session, UI filters)
- **Server State & Cache:** TanStack Query (`@tanstack/react-query` v5)
- **Networking:** Axios client with environment-aware baseURL and interceptors
- **Build System:** Expo Application Services (EAS Build) producing direct installable Android APKs

### Backend API
- **Framework:** FastAPI (Python 3.11+)
- **Data Validation & Settings:** Pydantic v2 & `pydantic-settings`
- **ORM & Database Toolkit:** SQLAlchemy 2.0
- **Database Driver:** PostgreSQL (`psycopg2-binary` / `psycopg`)
- **Server Runtime:** Uvicorn (ASGI)
- **Testing:** Pytest with HTTPX `TestClient`

---

## 3. Directory Structure

```
delco-chefs/
├── mobile/
│   ├── app/                                 # Expo Router file-based screens
│   │   ├── _layout.tsx                      # Root layout, theme provider & splash management
│   │   ├── index.tsx                        # Initial launch screen
│   │   ├── (auth)/
│   │   │   └── _layout.tsx                  # Authentication flow route group
│   │   ├── customer/
│   │   │   └── _layout.tsx                  # Customer portal flow
│   │   ├── chef/
│   │   │   └── _layout.tsx                  # Chef portal flow
│   │   └── admin/
│   │       └── _layout.tsx                  # Administrator portal flow
│   │
│   ├── src/                                 # Shared application source code
│   │   ├── components/                      # Reusable UI widgets (buttons, cards, headers)
│   │   ├── features/                        # Domain-driven feature modules
│   │   │   ├── authentication/              # Login, registration, role selection
│   │   │   ├── customer/                    # Chef discovery, menu browsing
│   │   │   ├── chef/                        # Chef profile, availability, menu items
│   │   │   ├── admin/                       # Chef verification, platform analytics
│   │   │   ├── bookings/                    # Booking creation, status, history
│   │   │   ├── payments/                    # Payment processing & invoices
│   │   │   └── tracking/                    # Real-time chef arrival tracking
│   │   ├── services/                        # API clients and query definitions
│   │   ├── hooks/                           # Custom business logic React hooks
│   │   ├── store/                           # Zustand stores (e.g. authStore)
│   │   ├── types/                           # Shared TypeScript interfaces & types
│   │   ├── constants/                       # App constants, role definitions, config
│   │   ├── utils/                           # General helpers and formatters
│   │   └── theme/                           # Centralized colors, typography & spacing
│   │
│   ├── assets/                              # App static assets
│   │   ├── images/                          # High-resolution raster graphics
│   │   ├── icons/                           # App icons and vector assets
│   │   └── fonts/                           # Custom typography files
│   │
│   ├── app.json                             # Expo app manifest & Android package metadata
│   ├── eas.json                             # EAS Build configuration for APK & AAB
│   ├── tsconfig.json                        # TypeScript configuration with @/* path aliases
│   ├── package.json                         # Mobile dependencies & scripts
│   └── .env.example                         # Mobile environment variables template
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── endpoints/
│   │   │   │   │   └── health.py            # Health check routes
│   │   │   │   └── api.py                   # V1 Router aggregator
│   │   │   └── deps.py                      # FastAPI dependency injection helpers
│   │   ├── core/
│   │   │   ├── config.py                    # Environment settings via Pydantic
│   │   │   └── database.py                  # SQLAlchemy engine & session factory
│   │   ├── models/                          # Database ORM models
│   │   │   └── base.py                      # SQLAlchemy Declarative Base
│   │   ├── schemas/                         # Pydantic request/response schemas
│   │   │   └── health.py                    # Health check response schemas
│   │   ├── services/                        # Business logic layer
│   │   ├── repositories/                    # Database access layer
│   │   ├── utils/                           # Backend helpers
│   │   └── main.py                          # FastAPI application entry point
│   ├── tests/
│   │   ├── conftest.py                      # Pytest fixtures and TestClient
│   │   └── test_health.py                   # Automated health endpoint verification
│   ├── requirements.txt                     # Backend Python dependencies
│   └── .env.example                         # Backend environment variables template
│
├── docs/
│   └── architecture.md                      # Architecture blueprint
│
├── .gitignore                               # Global ignore rules
└── README.md                                # Setup & operation guide
```

---

## 4. Mobile Architecture & Principles

### Native Android Guarantee
The mobile client is compiled into a genuine native Android application using React Native and Expo CNG (Continuous Native Generation). It does NOT employ WebViews, Next.js, or hybrid HTML wrappers.

### Feature-Driven Folder Structure
Business modules are located within `src/features/`. Each feature module encapsulates its own components, hooks, and types if feature-specific, while shared components reside in `src/components/`.

### Navigation Architecture
- **Expo Router:** Employs file-system routing.
- **Route Groups:**
  - `(auth)`: Login, registration, password recovery.
  - `(customer)`: Customer browsing, ordering, and booking tracking.
  - `(chef)`: Chef dashboard, schedule management, order acceptance.
  - `(admin)`: Platform monitoring, chef KYC verification.

---

## 5. Backend Architecture & Design

### Layered Structure
1. **API Layer (`app/api/`)**: Route declarations, request validation, response serialization.
2. **Service Layer (`app/services/`)**: Business logic, workflow validation, transaction coordination.
3. **Repository Layer (`app/repositories/`)**: Abstracted database queries and persistence.
4. **Data Models (`app/models/`)**: SQLAlchemy declarative entity schemas.
5. **Validation Schemas (`app/schemas/`)**: Pydantic models for contract enforcement.

---

## 6. Android Build & Distribution Strategy

The mobile application is pre-configured with Expo Application Services (EAS Build) in `mobile/eas.json`:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

- **`preview` profile:** Employs `"buildType": "apk"` to produce a standalone `.apk` file that can be downloaded and installed directly on any Android handset without submitting to the Google Play Console.
- **Android Package Identifier:** `com.delcochefs.app`
- **Application Display Name:** `Delco Chefs`
