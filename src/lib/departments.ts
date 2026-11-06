// PATH: src/lib/departments.ts
/** Fixed lists – never free text. */

// A broad starter list of programmes taught in Nigerian universities, polytechnics and colleges of education.
// It is NOT limited to this list: a student can search, then tap "Use" (or type their own department).
// Names that students typed themselves are saved as typed, so nothing breaks if a department is missing.
// To add a department, add its name in quotes below (keep the list in A-Z order).
export const DEPARTMENTS: string[] = [
  "Accounting",
  "Actuarial Science",
  "Adult Education",
  "Agricultural Economics",
  "Agricultural Engineering",
  "Agricultural Extension",
  "Agriculture",
  "Anatomy",
  "Animal Science",
  "Arabic",
  "Archaeology",
  "Architecture",
  "Banking & Finance",
  "Biochemistry",
  "Biology",
  "Biomedical Engineering",
  "Biotechnology",
  "Botany",
  "Building Technology",
  "Business Administration",
  "Business Education",
  "Chemical Engineering",
  "Chemistry",
  "Christian Religious Studies",
  "Civil Engineering",
  "Computer Education",
  "Computer Engineering",
  "Computer Science",
  "Criminology & Security Studies",
  "Crop Science",
  "Cyber Security",
  "Data Science",
  "Dentistry",
  "Early Childhood Education",
  "Economics",
  "Education",
  "Educational Management",
  "Electrical / Electronics Engineering",
  "Electrical Engineering",
  "Electronics Engineering",
  "English",
  "English Education",
  "Entrepreneurship",
  "Environmental Management",
  "Estate Management",
  "Fine & Applied Arts",
  "Fisheries & Aquaculture",
  "Food Science / Technology",
  "Forestry & Wildlife",
  "French",
  "Geography",
  "Geology",
  "Geophysics",
  "Guidance & Counselling",
  "Health Education",
  "Health Information Management",
  "History",
  "Home Economics",
  "Hospitality Management",
  "Human Anatomy",
  "Human Kinetics",
  "Human Nutrition & Dietetics",
  "Industrial Chemistry",
  "Industrial Design",
  "Industrial Mathematics",
  "Information Technology",
  "Insurance",
  "International Relations",
  "Islamic Studies",
  "Law",
  "Library & Information Science",
  "Linguistics",
  "Marine Engineering",
  "Marketing",
  "Mass Communication",
  "Materials & Metallurgical Engineering",
  "Mathematics",
  "Mechanical Engineering",
  "Mechatronics Engineering",
  "Medical Laboratory Science",
  "Medical Radiography",
  "Medicine & Surgery",
  "Microbiology",
  "Music",
  "Nursing",
  "Nutrition & Dietetics",
  "Office Technology & Management",
  "Optometry",
  "Petroleum Engineering",
  "Pharmacology",
  "Pharmacy",
  "Philosophy",
  "Physics",
  "Physics Education",
  "Physiology",
  "Physiotherapy",
  "Plant Science",
  "Political Science",
  "Primary Education",
  "Psychology",
  "Public Administration",
  "Public Health",
  "Purchasing & Supply",
  "Quantity Surveying",
  "Science Laboratory Technology",
  "Social Work",
  "Sociology",
  "Software Engineering",
  "Soil Science",
  "Special Education",
  "Statistics",
  "Surveying & Geoinformatics",
  "Systems Engineering",
  "Taxation",
  "Theatre Arts",
  "Transport Management",
  "Urban & Regional Planning",
  "Veterinary Medicine",
  "Zoology",
]

/**
 * Cleans a department the student typed: removes extra spaces, caps the length,
 * fixes the capital letters, and uses our exact spelling if it is already in the list.
 * Returns "" when there is nothing usable.
 */
export function cleanDepartment(raw: string): string {
  const spaced = raw.replace(/\s+/g, " ").trim().slice(0, 80)
  if (spaced.length < 3) return ""

  // Already in the list (ignoring capital letters)? Use the list spelling.
  const found = DEPARTMENTS.find((d) => d.toLowerCase() === spaced.toLowerCase())
  if (found) return found

  // Otherwise: capital letter at the start of each word, small words stay small
  const small = new Set(["and", "of", "in", "for", "the", "&", "/"])
  return spaced
    .split(" ")
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (i > 0 && small.has(lower)) return lower
      // Keep short all-capital words such as "ICT" or "HND"
      if (word.length <= 4 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(" ")
}

export const LEVELS = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "ND 1",
  "ND 2",
  "HND 1",
  "HND 2",
] as const

export type Level = (typeof LEVELS)[number]
