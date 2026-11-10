# Delco Chefs

A genuine native Android mobile application and API backend for an on-demand home chef service.

---

## Architecture Overview

```
delco-chefs/
├── mobile/                   # Native React Native / Expo Android application
│   ├── app/                  # File-based routes (Expo Router)
│   │   ├── _layout.tsx       # Root layout & splash screen handler
│   │   ├── index.tsx         # Launch screen ("Delco Chefs - Home Chef Service")
│   │   ├── (auth)/           # Authentication route group
│   │   ├── (customer)/       # Customer experience route group
│   │   ├── (chef)/           # Chef portal route group
│   │   └── (admin)/          # Admin portal route group
│   ├── src/                  # Modular application architecture
│   │   ├── components/       # Shared UI components
│   │   ├── features/         # Feature-based domain logic
│   │   ├── services/         # Axios API client & TanStack Query client
│   │   ├── hooks/            # Custom React hooks
│   │   ├── store/            # Zustand global state
│   │   ├── types/            # TypeScript interfaces
│   │   ├── constants/        # Application constants & configuration
│   │   ├── utils/            # General utilities
│   │   └── theme/            # Central design tokens (colors, spacing, typography)
│   ├── assets/               # Icons, images, and typography
│   ├── app.json              # Android package config (com.delcochefs.app)
│   ├── eas.json              # EAS Build profiles (including APK generation)
│   ├── tsconfig.json         # TypeScript strict configuration with @/* aliases
│   └── package.json          # Mobile dependencies & scripts
│
├── backend/                  # Python FastAPI backend service
│   ├── app/
│   │   ├── api/              # API router and endpoints (/health, /api/v1/health)
│   │   ├── core/             # App configuration and database setup
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic validation schemas
│   │   ├── services/         # Business logic layer
│   │   ├── repositories/     # Data access layer
│   │   ├── utils/            # Backend utilities
│   │   └── main.py           # FastAPI application entry point
│   ├── tests/                # Automated pytest suite
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Backend environment variables
│
├── docs/
│   └── architecture.md       # Detailed technical architecture guide
│
├── .gitignore
└── README.md
```

---

## Prerequisites

- **Node.js**: v18+ (Node v20 or v24 recommended)
- **Python**: v3.10+ (Python 3.11 recommended)
- **Android Device**: Handset with the **Expo Go** app installed from Google Play Store
- **Expo Account** *(for cloud APK builds)*: Free account at [expo.dev](https://expo.dev)

---

## Quick Start Guide

### 1. Start the Mobile App

Navigate into the `mobile` directory and launch the Expo development server:

```bash
cd delco-chefs/mobile
npm run start
```

*(Alternatively, use `npx expo start`)*

---

### 2. Open on Android Phone using Expo Go

1. Connect your Android phone to the same Wi-Fi network as your computer.
2. Open the **Expo Go** application on your Android phone.
3. In your terminal running `npm run start`, a QR code will be displayed.
4. Tap **Scan QR code** in Expo Go and point your camera at the terminal QR code.
5. The application will bundle and open on your device, displaying:
   ```
   Delco Chefs
   Home Chef Service
   ```

> **Note for different networks or VPNs:**  
> If your phone and PC cannot talk directly over local Wi-Fi, run:
> ```bash
> npx expo start --tunnel
> ```

---

### 3. Start the Backend

Open a separate terminal window, navigate into `backend`, and start the FastAPI server:

```bash
cd delco-chefs/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Verify Backend Health:
- **Root Health Check**: [http://localhost:8000/health](http://localhost:8000/health)
- **API v1 Health Check**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- **Interactive Swagger Docs**: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)

---

### 4. Generate an Installable Android APK using EAS

To build a standalone `.apk` file that can be downloaded and installed directly on any Android phone (without publishing to Google Play Store):

1. **Log in to EAS:**
   ```bash
   cd delco-chefs/mobile
   npx eas-cli login
   ```

2. **Trigger the APK build:**
   ```bash
   npx eas-cli build --platform android --profile preview
   ```

3. When the build finishes on Expo's cloud builder, EAS will print a direct download URL and QR code for the `.apk` file.
4. Download the `.apk` onto your Android phone and install it directly.

---

## Validation Commands

Run these commands to verify the environment:

```bash
# 1. Typecheck the mobile TypeScript code
cd delco-chefs/mobile
npm run typecheck

# 2. Check Expo dependencies and project configuration
cd delco-chefs/mobile
npm run doctor

# 3. Test Android bundling
cd delco-chefs/mobile
npx expo export --platform android

# 4. Run backend automated tests
cd delco-chefs/backend
python -m pytest tests
```

---

## Technology Highlights

- **Genuine Native Android**: Uses React Native components (`View`, `Text`, `StyleSheet`, `SafeAreaView`) with Continuous Native Generation.
- **Expo Router**: Route groups (`(auth)`, `(customer)`, `(chef)`, `(admin)`) provide scalable, role-based screen organization.
- **Ready for Global State & Data Fetching**: Zustand and TanStack Query (`@tanstack/react-query`) are pre-configured.
- **FastAPI Layering**: Pre-structured into `core`, `models`, `schemas`, `services`, `repositories`, and `api`.
