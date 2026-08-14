import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PersonaMarkdown from "@/components/PersonaMarkdown";

vi.mock("@/hooks/useUserQueries", () => ({
  useUsersByUsernames: () => ({ data: new Map() }),
}));

describe("PersonaMarkdown", () => {
  it("renders profile formatting as Markdown instead of raw syntax", () => {
    render(<PersonaMarkdown content={"1. First\n2. **Important**"} />);

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("Important").tagName).toBe("STRONG");
    expect(screen.queryByText("**Important**")).not.toBeInTheDocument();
  });

  it("does not add list markers to plain profile lines", () => {
    const { container } = render(<PersonaMarkdown content="Keep learning" />);

    expect(screen.getByText("Keep learning")).toBeInTheDocument();
    expect(container.querySelector("ul, ol")).toBeNull();
  });
});
