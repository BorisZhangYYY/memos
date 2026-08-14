import { XIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { containsPersonaInterestSeparator, normalizePersonaInterestTags } from "@/lib/persona";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  removeLabel: (tag: string) => string;
}

const PersonaInterestInput = ({ id, value, onChange, placeholder, removeLabel }: Props) => {
  const [draft, setDraft] = useState("");

  const addDraft = (nextDraft = draft) => {
    const nextTags = normalizePersonaInterestTags([...value, nextDraft]);
    if (nextTags.length !== value.length || nextTags.some((tag, index) => tag !== value[index])) {
      onChange(nextTags);
    }
    setDraft("");
  };

  const handleChange = (nextValue: string) => {
    if (containsPersonaInterestSeparator(nextValue)) {
      addDraft(nextValue);
      return;
    }
    setDraft(nextValue);
  };

  const removeTag = (index: number) => onChange(value.filter((_, itemIndex) => itemIndex !== index));

  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-transparent px-2 py-1 shadow-xs",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20",
      )}
    >
      {value.map((tag, index) => (
        <span
          key={`${index}-${tag}`}
          className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-muted px-2 text-xs text-foreground"
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(index)}
            className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={removeLabel(tag)}
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <Input
        id={id}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => draft.trim() && addDraft()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" || [";", "；", ",", "，", "、"].includes(event.key)) {
            event.preventDefault();
            addDraft();
          } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
            removeTag(value.length - 1);
          }
        }}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="h-6 min-w-28 flex-1 border-0 bg-transparent px-1 py-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
    </div>
  );
};

export default PersonaInterestInput;
