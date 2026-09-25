import { acceptCompletion, CompletionContext, completionStatus, currentCompletions } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildEditorExtensions } from "@/components/MemoEditor/Editor/extensions";
import { makeTagCompletionSource } from "@/components/MemoEditor/Editor/tagAutocomplete";
import { memoMarkdownExtensions } from "@/utils/memo-markdown-extension";

function complete(doc: string, pos: number, tags: string[], explicit = false) {
  const source = makeTagCompletionSource(() => tags);
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: memoMarkdownExtensions })] });
  return source(new CompletionContext(state, pos, explicit));
}

describe("tag autocomplete", () => {
  it("offers matching known tags", () => {
    expect(complete("#t", 2, ["thoughts", "today", "work"])?.options.map((option) => option.label)).toEqual(["thoughts", "today"]);
  });

  it.each(["hello #", "hello#", "## heading #", "> text #", "- [ ] #", "#######"])("offers all tags after a bare hash: %s", (doc) => {
    const result = complete(doc, doc.length, ["todo", "work"]);
    expect(result?.from).toBe(doc.length);
    expect(result?.options.map((option) => option.label)).toEqual(["todo", "work"]);
  });

  it.each([
    "#",
    "##",
    "######",
    "   #",
    "> #",
    "- #",
    "1. ##",
    "- item\n  #",
  ])("does not automatically complete an opening heading marker: %s", (doc) => expect(complete(doc, doc.length, ["todo"])).toBeNull());

  it.each(["#", "> ##", "- #"])("allows explicit completion at an opening heading marker: %s", (doc) => {
    expect(complete(doc, doc.length, ["todo"], true)?.options.map((option) => option.label)).toEqual(["todo"]);
  });

  it.each([
    "`#│`",
    "```\n#│\n```",
    "[#│](/path)",
    "https://example.com/#│",
    "\\#│",
    "$#│$",
    '<span title="#│">',
    "<!-- #│ -->",
    "[#│][known]\n\n[known]: /path",
    "#│foo@example.com",
  ])("completes tags regardless of surrounding Markdown: %s", (source) => {
    for (const typed of ["", "t"]) {
      const position = source.indexOf("│");
      const result = complete(source.replace("│", typed), position + typed.length, ["thoughts"]);
      expect(result?.from).toBe(position);
      expect(result?.options.map((option) => option.label)).toEqual(["thoughts"]);
    }
  });

  it.each(["", "hello world", "# ", "#tag ", "#work//", "&#35;to"])("does not offer tags outside active input: %s", (doc) => {
    expect(complete(doc, doc.length, ["todo", "work/project"])).toBeNull();
  });

  it("ranks nested tag matches and completes children after a slash", () => {
    const ranked = complete("#work", 5, ["home/paperwork", "team/work-log", "work/project"]);
    expect(ranked?.options.map((option) => option.label)).toEqual(["work/project", "team/work-log", "home/paperwork"]);
    const children = complete("#work/", 6, ["work", "work/private", "work/project", "home"]);
    expect(children?.from).toBe(1);
    expect(children?.options.map((option) => option.label)).toEqual(["work/private", "work/project"]);
  });

  it("supports Unicode, apostrophes, and nested segment matches", () => {
    expect(complete("#工作/", 4, ["工作/项目"])?.options.map((option) => option.label)).toEqual(["工作/项目"]);
    expect(complete("#O'Br", 5, ["O'Brien", "O’Connor"])?.options.map((option) => option.label)).toEqual(["O'Brien"]);
    expect(complete("#Mem", 4, ["software/hosted/Memos"])?.options.map((option) => option.label)).toEqual(["software/hosted/Memos"]);
  });

  it("distinguishes keycap emoji from a tag introducer", () => {
    expect(complete("#️⃣", 3, ["#️⃣"])).toBeNull();
    expect(complete("##️⃣", 4, ["#️⃣"])?.options.map((option) => option.label)).toEqual(["#️⃣"]);
  });
});

describe("tag completion popup", () => {
  it.each([
    ["hello ", "#", "hello #software/hosted/Memos"],
    ["", "#Mem", "#software/hosted/Memos"],
    ["", "#software/hosted/", "#software/hosted/Memos"],
  ])("opens and inserts a full nested tag", async (initial, input, expected) => {
    const view = new EditorView({
      state: EditorState.create({
        doc: initial,
        selection: { anchor: initial.length },
        extensions: buildEditorExtensions({
          placeholder: "",
          onChange: () => {},
          onFiles: () => {},
          onUpdate: () => {},
          onSubmit: () => {},
          getTags: () => ["software/hosted/Memos"],
        }),
      }),
      parent: document.body,
    });
    try {
      view.focus();
      for (const character of input) {
        view.dispatch({
          changes: { from: view.state.selection.main.head, insert: character },
          selection: { anchor: view.state.selection.main.head + character.length },
          userEvent: "input.type",
        });
      }
      await waitFor(() => expect(completionStatus(view.state)).toBe("active"));
      expect(currentCompletions(view.state).map((option) => option.label)).toEqual(["software/hosted/Memos"]);
      await waitFor(() => expect(acceptCompletion(view)).toBe(true));
      expect(view.state.doc.toString()).toBe(expected);
    } finally {
      view.destroy();
    }
  });
});
