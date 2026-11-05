// PATH: src/lib/departments.ts
/** Fixed lists – never free text. */

export const DEPARTMENTS = [
  "Accounting",
  "Agricultural Engineering",
  "Agriculture",
  "Architecture",
  "Biochemistry",
  "Biology",
  "Biomedical Engineering",
  "Business Administration",
  "Chemical Engineering",
  "Chemistry",
  "Civil Engineering",
  "Computer Engineering",
  "Computer Science",
  "Economics",
  "Education",
  "Electrical / Electronics Engineering",
  "English",
  "Estate Management",
  "Food Science / Technology",
  "Geology",
  "History",
  "Industrial Chemistry",
  "Information Technology",
  "Law",
  "Library & Information Science",
  "Mass Communication",
  "Mathematics",
  "Mechanical Engineering",
  "Medicine",
  "Microbiology",
  "Nursing",
  "Petroleum Engineering",
  "Pharmacy",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Administration",
  "Sociology",
  "Software Engineering",
  "Statistics",
  "Surveying & Geoinformatics",
  "Other",
] as const

export type Department = (typeof DEPARTMENTS)[number]

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
