"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Moon, Sun } from "lucide-react"

export function ModeToggle() {
  const { theme, setTheme, systemTheme } = useTheme()
  const currentTheme = theme === "system" ? systemTheme : theme

  React.useEffect(() => {
    if (theme === "system" && systemTheme === "dark") {
      setTheme("dark")
    }
  }, [systemTheme, theme, setTheme])

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="theme-mode"
        checked={currentTheme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      />
      <Label htmlFor="theme-mode" className="flex items-center gap-2">
        {currentTheme === "dark" ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
      </Label>
    </div>
  )
}
