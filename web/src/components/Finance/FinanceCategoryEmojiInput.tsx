import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  commitOnBlur?: boolean;
  ariaLabel: string;
}

const FinanceCategoryEmojiInput = ({ value, onChange, className, commitOnBlur = false, ariaLabel }: Props) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const nextValue = draft.trim();
    setDraft(nextValue);
    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  return (
    <Input
      value={commitOnBlur ? draft : value}
      maxLength={16}
      className={cn("h-9 px-2 text-center font-mono text-lg", className)}
      aria-label={ariaLabel}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (commitOnBlur) {
          setDraft(nextValue);
        } else {
          onChange(nextValue);
        }
      }}
      onBlur={commitOnBlur ? commit : undefined}
      onKeyDown={(event) => {
        if (commitOnBlur && event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
};

export default FinanceCategoryEmojiInput;
