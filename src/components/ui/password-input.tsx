"use client"

import { useState, forwardRef, InputHTMLAttributes } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"

// A password box with an eye button to show or hide what you typed
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
    // false = dots are hidden, true = password is visible
    const [show, setShow] = useState(false)

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          className="pr-12"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground"
        >
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
