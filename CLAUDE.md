# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CV consulting and job matching Next.js application that helps users find job opportunities based on their CV and career preferences. The app consists of a job matching interface with AI-powered profile scoring and a Swedish-language CV consulting service.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build the application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture

### Framework & Core Technologies
- **Next.js 15.3.5** with App Router architecture
- **TypeScript** with strict configuration
- **Tailwind CSS** for styling with TailwindCSS v4
- **Radix UI** components for accessible UI primitives
- **Supabase** for database and backend services
- **Stripe** for payment processing

### Directory Structure
- `src/app/` - Next.js App Router pages and API routes
  - `api/match/` - Job matching endpoints (`init`, `refine`)
  - `api/admin/` - Admin functionality
  - `admin/` - Admin dashboard pages
- `src/components/ui/` - Reusable UI components built on Radix UI
- `src/lib/` - Utility functions and shared logic

### Key Features
1. **Job Matching System** (`src/app/page.tsx`):
   - CV text input with file upload support
   - Location-based job search with radius filtering
   - AI-powered profile matching using embeddings
   - Career wishlist refinement system
   - Real-time job scoring (profile match + preference match)

2. **API Endpoints**:
   - `/api/match/init` - Initial job matching based on CV
   - `/api/match/refine` - Refine matches based on career preferences
   - `/api/checkout` - Stripe payment processing
   - `/api/create-candidate-profile` - Profile management

3. **Scoring System**:
   - Profile match score (CV vs job requirements)
   - Wishlist match score (preferences vs job attributes)
   - Final score: 0.7 * profile + 0.3 * wishlist + remote boost

### Import Path Configuration
- Base URL: `./src`
- Path alias: `@/*` maps to `src/*`
- Use absolute imports: `@/components/ui/button` instead of relative paths

### Data Flow
1. User submits CV text + location
2. System calls embeddings API to create profile vector
3. Jobs are fetched and scored using cosine similarity
4. Optional: User refines with career wishlist preferences
5. Jobs are re-scored and re-ranked

### UI Components
- Uses shadcn/ui component library patterns
- Consistent with Radix UI primitives
- TailwindCSS for styling with custom design tokens
- Responsive design with mobile-first approach

### Environment Variables
The project uses `.env` for configuration (ensure sensitive keys are not committed).

## Development Notes

- The app uses Swedish language for UI text and content
- Location data includes Swedish cities with fallback coordinates
- Job matching algorithm uses vector embeddings and cosine similarity
- Payment integration through Stripe for consulting services
- Admin interface for CV viewing and management