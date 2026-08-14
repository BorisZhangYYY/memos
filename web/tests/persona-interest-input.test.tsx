import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import PersonaInterestInput from "@/components/PersonaInterestInput";
import { normalizePersonaInterestTags } from "@/lib/persona";

const TestInput = ({ initialValue = [] }: { initialValue?: string[] }) => {
  const [value, setValue] = useState(initialValue);
  return (
    <PersonaInterestInput
      value={value}
      onChange={setValue}
      placeholder="Add interest"
      removeLabel={(tag) => `Remove ${tag}`}
    />
  );
};

describe("PersonaInterestInput", () => {
  it("creates separate items with semicolons, Chinese punctuation, and Enter", () => {
    render(<TestInput />);
    const input = screen.getByPlaceholderText("Add interest");

    fireEvent.change(input, { target: { value: "后端开发;云原生、大模型" } });
    fireEvent.change(input, { target: { value: "阅读" } });
    fireEvent.keyDown(input, { key: "Enter" });

    for (const tag of ["后端开发", "云原生", "大模型", "阅读"]) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }
  });

  it("removes one item without changing the others", () => {
    render(<TestInput initialValue={["AI", "阅读"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove AI" }));

    expect(screen.queryByText("AI")).not.toBeInTheDocument();
    expect(screen.getByText("阅读")).toBeInTheDocument();
  });
});

describe("normalizePersonaInterestTags", () => {
  it("splits legacy combined values and removes duplicates", () => {
    expect(normalizePersonaInterestTags(["后端开发、云原生、大模型", "云原生;阅读"])).toEqual(["后端开发", "云原生", "大模型", "阅读"]);
  });
});
