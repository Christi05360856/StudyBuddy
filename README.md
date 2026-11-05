# StudyBuddy NG

Study smarter from your own class notes.

## What this app does

- Students register with name, institution, matric number + password
- Upload lecture PDFs
- System automatically generates MCQs from the PDF (background)
- Students take timed Test / Exam / Custom quizzes from the generated questions
- AI Tutor explains concepts simply (Primary 2 style)
- Progress tracking

## Tech Stack

- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Auth + Database + Storage)
- Google Gemini (question generation + AI tutor)

## Setup (for you later)

1. Clone / download the code
2. Create `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   GEMINI_API_KEY=your_gemini_key
   ```
3. Run the SQL schema in Supabase SQL Editor (already done)
4. Create a Storage bucket named `materials` (private)
5. `npm install`
6. `npm run dev`

## Edge cases handled / planned

- User requests more questions than available → use all available questions
- PDF still processing → show progress, disable quiz until ready
- PDF processing fails → mark as failed, allow retry
- Empty or unreadable PDF → fail gracefully with message
- Network drops during quiz → answers saved in state (later: localStorage + resume)
- Timer reaches zero → auto-submit
- Duplicate matric number → Supabase unique constraint
- No courses yet → empty state with clear CTA
- Very short PDF → generate fewer questions, still usable
- Large PDF → chunk text before sending to Gemini
- Flagged questions → user can mark for review
- Admin can upload pre-made MCQ banks (future)

## Current status

- Auth pages (Sign up / Login) – UI complete
- Home page – UI complete
- Courses list + detail – UI complete
- Quiz taking + Result – UI complete with timer
- Database schema – created in Supabase
- Real data connection + AI generation – next steps
