"use client";

import * as React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import Link from "@tiptap/extension-link";
import ListItem from "@tiptap/extension-list-item";
import OrderedList from "@tiptap/extension-ordered-list";
import BulletList from "@tiptap/extension-bullet-list";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Blockquote from "@tiptap/extension-blockquote";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Image } from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { CharacterCount } from "@tiptap/extension-character-count";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  
  
  Underline as UnderlineIcon,
  Strikethrough,
  Code as CodeIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Terminal,
  Minus,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  
  Highlighter,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toggle } from "@/components/ui/toggle";

interface RichTextEditorProps {
  value: unknown;
  onChange: (json: unknown) => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  editable?: boolean;
  minHeight?: string;
  placeholder?: string;
}

export function RichTextEditor({
  value,
  onChange,
  title,
  onTitleChange,
  editable = true,
  minHeight = "200px",
  placeholder = "Start writing...",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      Underline,
      Strike,
      Link.configure({ openOnClick: false, autolink: true }).extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            target: { default: null },
            rel: { default: null },
          };
        },
      }),
      ListItem,
      OrderedList,
      BulletList,
      TaskList,
      TaskItem,
      Blockquote,
      Code,
      CodeBlock,
      HorizontalRule,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Color,
      TextStyle,
      Highlight.configure({ multicolor: true }),
      CharacterCount,
      Placeholder.configure({ placeholder }),
    ],
    content: value ?? { type: "doc", content: [] },
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  React.useEffect(() => {
    if (editor && value !== editor.getJSON()) {
      editor.commands.setContent(value ?? { type: "doc", content: [] });
    }
  }, [value, editor]);

  const setLink = React.useCallback(() => {
    const previousUrl = editor?.getAttributes("link").href;
    const url = window.prompt("Link URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank", rel: "noopener noreferrer" }).run();
  }, [editor]);

  const addImage = React.useCallback(() => {
    const url = window.prompt("Image URL");
    if (url) {
      editor?.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const addTable = React.useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="space-y-2 border border-hairline/60 rounded-md p-2">
      {onTitleChange !== undefined ? (
        <Input
          value={title ?? ""}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Block title (optional)"
          className="h-8 text-[12px]"
        />
      ) : title ? (
        <p className="px-1 text-[12px] font-medium text-ink">{title}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1 border-b border-hairline/60 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost"  className="h-7 px-2 text-[11px]">
              <Type className="h-3.5 w-3.5 mr-1" />
              Format
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
              Paragraph
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <Heading1 className="h-3.5 w-3.5 mr-1" /> Heading 1
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="h-3.5 w-3.5 mr-1" /> Heading 2
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 className="h-3.5 w-3.5 mr-1" /> Heading 3
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>


        <Toggle  pressed={editor.isActive("underline")} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} className="h-7 w-7 p-0">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive("strike")} onPressedChange={() => editor.chain().focus().toggleStrike().run()} className="h-7 w-7 p-0">
          <Strikethrough className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive("code")} onPressedChange={() => editor.chain().focus().toggleCode().run()} className="h-7 w-7 p-0">
          <CodeIcon className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive("highlight")} onPressedChange={() => editor.chain().focus().toggleHighlight().run()} className="h-7 w-7 p-0">
          <Highlighter className="h-3.5 w-3.5" />
        </Toggle>

        <div className="w-px h-5 bg-hairline/60 mx-1" />

        <Toggle  pressed={editor.isActive("bulletList")} onPressedChange={() => editor.chain().focus().toggleBulletList().run()} className="h-7 w-7 p-0">
          <List className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive("orderedList")} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()} className="h-7 w-7 p-0">
          <ListOrdered className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive("taskList")} onPressedChange={() => editor.chain().focus().toggleTaskList().run()} className="h-7 w-7 p-0">
          <CheckSquare className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive("blockquote")} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()} className="h-7 w-7 p-0">
          <Quote className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive("codeBlock")} onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()} className="h-7 w-7 p-0">
          <Terminal className="h-3.5 w-3.5" />
        </Toggle>

        <div className="w-px h-5 bg-hairline/60 mx-1" />

        <Toggle  pressed={editor.isActive({ textAlign: "left" })} onPressedChange={() => editor.chain().focus().setTextAlign("left").run()} className="h-7 w-7 p-0">
          <AlignLeft className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive({ textAlign: "center" })} onPressedChange={() => editor.chain().focus().setTextAlign("center").run()} className="h-7 w-7 p-0">
          <AlignCenter className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive({ textAlign: "right" })} onPressedChange={() => editor.chain().focus().setTextAlign("right").run()} className="h-7 w-7 p-0">
          <AlignRight className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle  pressed={editor.isActive({ textAlign: "justify" })} onPressedChange={() => editor.chain().focus().setTextAlign("justify").run()} className="h-7 w-7 p-0">
          <AlignJustify className="h-3.5 w-3.5" />
        </Toggle>

        <div className="w-px h-5 bg-hairline/60 mx-1" />

        <Button variant="ghost"  className="h-7 w-7 p-0" onClick={setLink} title="Add link">
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost"  className="h-7 w-7 p-0" onClick={addImage} title="Add image">
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost"  className="h-7 w-7 p-0" onClick={addTable} title="Add table">
          <TableIcon className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost"  className="h-7 w-7 p-0" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus className="h-3.5 w-3.5" />
        </Button>

        <div className="w-px h-5 bg-hairline/60 mx-1" />

        <Button variant="ghost"  className="h-7 w-7 p-0" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost"  className="h-7 w-7 p-0" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <EditorContent editor={editor} style={{ minHeight }} className="prose prose-sm max-w-none [&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:p-2 [&_.ProseMirror]:text-[12px] [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-1.5 [&_.ProseMirror_h1]:mt-2 [&_.ProseMirror_h1]:mb-1.5 [&_.ProseMirror_h2]:mt-2 [&_.ProseMirror_h2]:mb-1.5 [&_.ProseMirror_h3]:mt-1.5 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_ul]:my-1.5 [&_.ProseMirror_ol]:my-1.5 [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_hr]:my-2 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_table]:my-2" />
      <div className="flex justify-end px-1">
        <span className="text-[10px] text-muted-foreground">
          {editor.storage.characterCount.characters()} characters
        </span>
      </div>
    </div>
  );
}
