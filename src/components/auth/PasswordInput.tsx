"use client";

import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { IconButton, Input, type InputProps } from "@puckoops/camelot";
import { forwardRef, useState } from "react";

/** A password field with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type" | "suffix">>(function PasswordInput(props, ref) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      ref={ref}
      {...props}
      type={shown ? "text" : "password"}
      suffix={
        <IconButton
          icon={shown ? ViewOffSlashIcon : ViewIcon}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          variant="bare"
          size="sm"
          onClick={() => setShown((v) => !v)}
        />
      }
    />
  );
});
