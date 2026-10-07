'use client'

// A submit button that asks first. The form around it stays a plain
// server-action POST (it still works, and is still verifiable, without
// JavaScript); this only adds a browser confirm before an irreversible step.
export function ConfirmSubmit({
  message,
  className,
  children,
}: {
  /** The question, e.g. "Dispatch MF-0412 to Evergreen? This cannot be undone." */
  message: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
