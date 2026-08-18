import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FinanceCategoryEmojiInput from "@/components/Finance/FinanceCategoryEmojiInput";

describe("FinanceCategoryEmojiInput", () => {
  it("uses the same height as the other category form controls", () => {
    render(<FinanceCategoryEmojiInput value="" onChange={() => {}} ariaLabel="Emoji" />);

    const input = screen.getByRole("textbox", { name: "Emoji" });
    expect(input).toHaveClass("h-9");
    expect(input).not.toHaveAttribute("placeholder");
  });

  it("accepts an emoji directly without opening a picker", () => {
    const onChange = vi.fn();
    render(<FinanceCategoryEmojiInput value="" onChange={onChange} ariaLabel="Emoji" />);

    fireEvent.change(screen.getByRole("textbox", { name: "Emoji" }), { target: { value: "👨‍👩‍👧‍👦" } });

    expect(onChange).toHaveBeenCalledWith("👨‍👩‍👧‍👦");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("commits an existing category emoji on blur", () => {
    const onChange = vi.fn();
    render(<FinanceCategoryEmojiInput value="🍽️" onChange={onChange} ariaLabel="Emoji" commitOnBlur />);
    const input = screen.getByRole("textbox", { name: "Emoji" });

    fireEvent.change(input, { target: { value: "🛒" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("🛒");
  });
});
