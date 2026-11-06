// PATH: src/components/department-field.tsx
"use client"

// One department picker used on sign up, the profile page and the home page.
//  - Pick from the list, or search and tap "Use" for a department that is not listed.
//  - Or tap "My department is not listed" and simply type it in the box.

import { useState } from "react"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Input } from "@/components/ui/input"
import { DEPARTMENTS } from "@/lib/departments"

type DepartmentFieldProps = {
  id?: string
  value: string
  onChange: (value: string) => void
}

export function DepartmentField({ id, value, onChange }: DepartmentFieldProps) {
  // If the saved department is not in our list, start in "type it" mode so the student sees it
  const [typing, setTyping] = useState(
    () => Boolean(value) && !DEPARTMENTS.some((d) => d.toLowerCase() === value.toLowerCase())
  )

  if (typing) {
    return (
      <div className="space-y-1.5">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your department, e.g. Nutrition and Dietetics"
          maxLength={80}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => {
            setTyping(false)
            onChange("")
          }}
          className="text-xs text-primary font-medium"
        >
          Choose from the list instead
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <SearchableSelect
        id={id}
        title="Choose your department"
        value={value}
        onChange={onChange}
        options={DEPARTMENTS}
        allowCustom
        placeholder="Tap to choose your department"
        searchPlaceholder="Search department"
      />
      <button type="button" onClick={() => setTyping(true)} className="text-xs text-primary font-medium">
        My department is not listed
      </button>
    </div>
  )
}
